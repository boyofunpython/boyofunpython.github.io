/** Check the legacy reference inventory and execute structured Python round trips. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "vite";
import { DOMImplementation, DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { CALL_SPECS } from "../src/editor/catalog-data.ts";

await mkdir("artifacts", { recursive: true });
const built = await build({
  configFile: false,
  publicDir: false,
  logLevel: "silent",
  build: {
    write: false,
    minify: false,
    lib: { entry: "src/editor/blocks.ts", formats: ["es"] },
  },
});
const output = (Array.isArray(built) ? built[0] : built).output;
const bundle = new URL(
  "../artifacts/toolbox-check-bundle.mjs",
  import.meta.url,
);
await writeFile(bundle, output.find((item) => item.type === "chunk").code);
const { Blockly, pythonGenerator, toolbox } = await import(
  bundle.href + "?check=" + Date.now()
);
Blockly.utils.xml.injectDependencies({
  document: new DOMImplementation().createDocument(null, "xml"),
  DOMParser,
  XMLSerializer,
});
const legacy = JSON.parse(
  await readFile("tests/fixtures/legacy-toolboxes.json", "utf8"),
);
const report = {
  legacy: legacy.commit,
  modes: {},
  templates: 0,
  roundTrips: 0,
  programs: 0,
};
const defaults = [];
const originalCalls = JSON.parse(
  execFileSync(
    "python3",
    [
      "-c",
      `import ast,json,sys
sources=[source for mode in json.load(sys.stdin).values() for category in mode for source in category.get('blocks',[])]
names=set()
for source in sources:
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node,ast.Call): continue
        if isinstance(node.func,ast.Name) and node.func.id!='___': names.add(node.func.id)
        elif isinstance(node.func,ast.Attribute):
            root=node.func.value
            names.add(root.id+'.'+node.func.attr if isinstance(root,ast.Name) and root.id in ('turtle','plt','random') else '.'+node.func.attr)
print(json.dumps(sorted(names)))`,
    ],
    {
      input: JSON.stringify({ normal: legacy.normal, full: legacy.full }),
      encoding: "utf8",
    },
  ),
);
const supportedCalls = new Set(
  CALL_SPECS.flatMap((spec) => [spec.name, ...(spec.aliases ?? [])]),
);
for (const name of originalCalls)
  assert(
    supportedCalls.has(name === "format_mime" ? "plt.show" : name),
    `Missing legacy operation: ${name}`,
  );

function generate(state) {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, workspace);
    return pythonGenerator.workspaceToCode(workspace);
  } finally {
    workspace.dispose();
  }
}
for (const [name, full] of [
  ["normal", false],
  ["full", true],
]) {
  const categories = toolbox(full).contents;
  for (const reference of legacy[name]) {
    const current = categories.find(
      (category) => category.name === reference.name,
    );
    assert(current, `Missing legacy category: ${name}/${reference.name}`);
    assert(
      current.contents.filter((item) => item.kind === "block").length >=
        new Set(reference.blocks ?? []).size,
      `Reduced legacy choices: ${name}/${reference.name}`,
    );
  }
  report.modes[name] = { categories: categories.length, blocks: 0 };
  for (const category of categories)
    for (const item of category.contents) {
      if (item.kind !== "block") continue;
      try {
        const state = { blocks: { languageVersion: 0, blocks: [item] } };
        defaults.push({
          name: `${name}/${category.name}/${item.type}`,
          source: generate(state),
        });
        report.modes[name].blocks++;
      } catch (error) {
        throw new Error(
          `${name}/${category.name}/${item.type}: ${error.message}`,
        );
      }
    }
}
report.templates = defaults.length;
const parser = `import json,sys,pathlib
payload=json.load(sys.stdin)
_studio_block_catalog=json.dumps(payload['catalog'])
exec(pathlib.Path('python/ast_blocks.py').read_text())
print(json.dumps([json.loads(parse_blocks(source)) for source in payload['sources']]))`;
function parse(sources) {
  return JSON.parse(
    execFileSync("python3", ["-c", parser], {
      input: JSON.stringify({ catalog: CALL_SPECS, sources }),
      maxBuffer: 20_000_000,
      encoding: "utf8",
    }),
  );
}
const states = parse(defaults.map((item) => item.source));
for (let index = 0; index < defaults.length; index++) {
  const state = states[index];
  assert(!state.error, `${defaults[index].name}: ${state.error}`);
  defaults[index].roundTrip = generate(state.state);
}
const verifySyntax = `import json,sys
for item in json.load(sys.stdin):
    for key in ('source','roundTrip'):
        wrapped='def example():\\n    for _ in range(1):\\n'+''.join('        '+line+'\\n' for line in item[key].splitlines())+'        pass\\n'
        try: compile(wrapped,item['name'],'exec')
        except SyntaxError as error: raise AssertionError(f"{item['name']} ({key}): {error}\\n{item[key]}")
print('ok')`;
assert.equal(
  execFileSync("python3", ["-c", verifySyntax], {
    input: JSON.stringify(defaults),
    encoding: "utf8",
  }).trim(),
  "ok",
);
report.roundTrips = defaults.length;
const programs = [
  `def label(value: int) -> str:\n    return str(value * 2)\nprint(label(21))`,
  `class Item:\n    def __init__(self, value):\n        self.value = value\n    def doubled(self):\n        return self.value * 2\nobj = Item(21)\nprint(obj.value, obj.doubled())`,
  `values = [i * i for i in range(8) if i % 2 == 0]\npairs = {i: i * 2 for i in range(3)}\nprint(values, sorted(pairs.items()), tuple(i + 1 for i in range(3)), sorted({i % 3 for i in range(5)}))`,
  `items = [0, 1, 2, 3, 4, 5]\nitems.append(6)\nprint(items[1:6:2], items[::-1], (1,), (), set(), {}, [*items, 7])\nitems.pop()\nitems.clear()\nprint(items)`,
  `text = " Hello,World "\nprint(text.strip().lower().replace('hello', 'hi').split(','))\nprint(','.join(['a', 'b']), 'item {}'.format(3), text.startswith(' '), text.endswith(' '))`,
  `from math import sqrt as root\nimport random as rng\nprint(root(81), bool(1), isinstance(3, int), sum([1, 2, 3]), list(zip([1, 2], ['a', 'b'])))`,
  `for value in [-1, 0, 2]:\n    if value < 0:\n        print('negative')\n    elif value == 0:\n        print('zero')\n    else:\n        # else note\n        print('positive')`,
  `try:\n    raise ValueError('sample')\nexcept ValueError as error:\n    print(str(error))\nelse:\n    print('unexpected')\nfinally:\n    print('finished')`,
  `with open('toolbox-check.txt', 'w') as file:\n    file.write('hello\\nworld')\nwith open('toolbox-check.txt', 'r') as file:\n    print(file.read())`,
  `double = lambda value: value * 2\nprint(list(map(double, [1, 2, 3])), list(filter(bool, [0, 1, 2])))`,
  `def count():\n    for value in range(3):\n        yield value\nprint(list(count()))`,
  `try:\n    try:\n        raise ValueError('again')\n    except:\n        raise\nexcept ValueError:\n    print('reraised')`,
  "try:\n    value = 5\nexcept ValueError:\n    # handler note\n    print('failed')\nelse:\n    # else note\n    print(value)\nfinally:\n    # finally note\n    print('finished')",
  "print(-(1 if True else 2), not (False if False else True), (1 if False else 2) + 3)\nprint([item for item in ([1, 2] if True else [3]) if (True if item else False)])",
];
const programStates = parse(programs);
const paired = programs.map((source, index) => {
  assert(!programStates[index].error);
  return { source, roundTrip: generate(programStates[index].state) };
});
for (const note of ["# handler note", "# else note", "# finally note"])
  assert(paired.at(-2).roundTrip.includes(note));
const verifyPrograms = `import json,sys,io,contextlib,tempfile,os
pairs=json.load(sys.stdin)
with tempfile.TemporaryDirectory(prefix="boyo-toolbox-") as directory:
    os.chdir(directory)
    for index,pair in enumerate(pairs):
        outputs=[]
        for source in pair.values():
            output=io.StringIO()
            with contextlib.redirect_stdout(output): exec(source, {'__name__':'__main__'})
            outputs.append(output.getvalue())
        assert outputs[0]==outputs[1], (index,outputs,pair)
print('ok')`;
assert.equal(
  execFileSync("python3", ["-c", verifyPrograms], {
    input: JSON.stringify(paired),
    encoding: "utf8",
  }).trim(),
  "ok",
);
report.programs = programs.length;
await writeFile(
  "artifacts/toolbox-coverage.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
