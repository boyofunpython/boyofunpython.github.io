import type * as Blockly from "blockly/core";
import { CALL_SPECS, type Seed } from "./catalog-data";
import { callBlock, seed } from "./catalog-blocks";

type Item = { kind: string; [key: string]: unknown };
const block = (
  type: string,
  fields: Record<string, unknown> = {},
  values: Record<string, Seed> = {},
  extraState?: unknown,
): Item => ({
  kind: "block",
  type,
  fields,
  inputs: Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { shadow: seed(value) },
    ]),
  ),
  ...(extraState === undefined ? {} : { extraState }),
});
const category = (name: string, colour: string, contents: Item[]): Item => ({
  kind: "category",
  name,
  colour,
  contents,
});
const expression = (code: string): Seed => ({ code });
const calls = (...types: string[]) => types.map((type) => callBlock(type));
const collection = (
  type: string,
  count: number,
  values: Record<string, Seed>,
) => block(type, {}, values, { count });
const dictionaries = () => [
  collection("py_dict", 3, {
    KEY0: "1st key",
    VALUE0: 0,
    KEY1: "2nd key",
    VALUE1: 0,
    KEY2: "3rd key",
    VALUE2: 0,
  }),
  collection("py_dict", 0, {}),
  block("py_index", {}, { OBJECT: expression("data"), INDEX: "key" }),
];
const condition = (elseIfCount = 0, hasElse = false) =>
  block(
    "controls_if",
    {},
    { IF0: true, ...(elseIfCount ? { IF1: true } : {}) },
    { elseIfCount, hasElse },
  );
const functions = () => [
  block("py_function"),
  block("py_function", {
    NAME: "function",
    PARAMS: "value: int",
    RETURNS: "str",
  }),
  block("py_return", {}, { VALUE: expression("value") }),
  block("py_call", { FUNC: "function" }, { ARG0: 0 }, { count: 1 }),
];
const tools = () => [
  ...calls(
    "python_input",
    "python_print",
    "python_loadCSV",
    "python_display",
    "random_randint",
    "random_choice",
    "random_sample",
  ),
  block("method_split", {}, { OBJECT: "string", SEP: "," }),
];
const values = (full: boolean) => [
  block("text"),
  block("py_number"),
  block("py_literal", { VALUE: "True" }),
  ...(full ? [block("py_literal", { VALUE: "None" })] : []),
  block(
    "lists_create_with",
    {},
    { ADD0: 0, ADD1: 0, ADD2: 0 },
    { itemCount: 3 },
  ),
  ...(full
    ? [
        collection("py_tuple", 3, { ITEM0: 0, ITEM1: 0, ITEM2: 0 }),
        collection("py_set", 3, { ITEM0: 1, ITEM1: 2, ITEM2: 3 }),
        ...dictionaries().slice(0, 1),
      ]
    : []),
];
const loops = () => [
  block("py_for", { NAME: "i" }, { ITER: expression("range(10)") }),
  block("py_while", {}, { TEST: expression("A == B") }),
  block("py_keyword", { KEYWORD: "break" }),
  block("py_keyword", { KEYWORD: "continue" }),
];
const turtles = () =>
  category(
    "畫圖🐢",
    "#4f9d82",
    CALL_SPECS.filter((spec) => spec.name.startsWith("turtle.")).map((spec) =>
      callBlock(spec.type),
    ),
  );
const variables = () =>
  category("變數", "#586baa", [
    { kind: "button", text: "建立變數…", callbackkey: "BOYO_CREATE_VARIABLE" },
    block("py_assign", { NAME: "name" }, { VALUE: 0 }),
    block("py_name", { NAME: "name" }),
    block("variables_set"),
    block("variables_get"),
    block("math_change", {}, { DELTA: 1 }),
  ]);
const lists = () => [
  block(
    "lists_create_with",
    {},
    { ADD0: 0, ADD1: 0, ADD2: 0 },
    { itemCount: 3 },
  ),
  block("lists_create_with", {}, {}, { itemCount: 3 }),
  block("lists_create_with", {}, {}, { itemCount: 0 }),
  ...calls("method_append", "python_range"),
];
const conversion = (full: boolean) =>
  calls(
    "python_int",
    "python_float",
    "python_str",
    "python_bool",
    ...(full
      ? [
          "python_chr",
          "python_list",
          "python_dict",
          "python_tuple",
          "python_set",
          "python_type",
          "python_isinstance",
        ]
      : []),
  );
const comprehension = (kind: string, filtered: boolean) =>
  block(
    "py_comprehension_" + kind,
    { VAR: "item" },
    {
      ...(kind === "dict" ? { KEY: expression("item") } : {}),
      VALUE: expression("item * 2"),
      ITER: expression("range(10)"),
      ...(filtered ? { TEST: expression("item % 2 == 0") } : {}),
    },
  );

export function toolbox(
  full: boolean,
): Blockly.utils.toolbox.ToolboxDefinition {
  const basic = [
    variables(),
    category("資料數值", "#539e84", values(false)),
    category("工具", "#4f9e98", tools()),
    category("數學運算", "#509aaa", [
      block("py_binary", { OP: "+" }, { LEFT: 0, RIGHT: 0 }),
      ...calls("python_round", "python_pow", "python_sqrt"),
    ]),
    category("邏輯判斷", "#9b6aba", [
      condition(),
      condition(0, true),
      block("py_binary", { OP: "<" }, { LEFT: 0, RIGHT: 10 }),
      block("py_binary", { OP: "and" }, { LEFT: true, RIGHT: true }),
      block("logic_negate", {}, { BOOL: true }),
      condition(1),
      condition(1, true),
    ]),
    category("迴圈", "#539d6e", loops()),
    turtles(),
    category("函式", "#ae65a0", functions()),
    category("資料轉換", "#4f9e98", conversion(false)),
    category("資料串(List)", "#5b86bd", lists()),
    category("字典資料", "#6f8fba", dictionaries()),
  ];
  if (!full)
    return {
      kind: "categoryToolbox",
      contents: basic,
    } as Blockly.utils.toolbox.ToolboxDefinition;
  const contents = [
    variables(),
    category("資料值", "#539e84", values(true)),
    category("數學計算", "#509aaa", [
      block("py_unary", { OP: "-" }, { VALUE: 1 }),
      block("py_binary", { OP: "+" }, { LEFT: 0, RIGHT: 0 }),
      block("py_binary", { OP: ">>" }, { LEFT: 8, RIGHT: 1 }),
      ...calls("python_abs", "python_round", "python_pow", "python_sqrt"),
    ]),
    category("邏輯判斷", "#9b6aba", [
      block("logic_ternary", {}, { IF: true, THEN: 1, ELSE: 0 }),
      ...["==", "<", "in", "and", "or"].map((OP) =>
        block("py_binary", { OP }, { LEFT: 0, RIGHT: 1 }),
      ),
      block("logic_negate", {}, { BOOL: true }),
    ]),
    category("物件", "#8b6abb", [
      block("py_class"),
      block("py_class", { NAME: "Example", BASES: "object" }),
      block("py_attribute", { ATTR: "name" }, { OBJECT: expression("self") }),
      block("py_annotation", { NAME: "value" }, { TYPE: expression("int") }),
      ...calls("python_super"),
    ]),
    category("函式", "#ae65a0", [
      ...functions(),
      block("py_yield", {}, { VALUE: expression("value") }),
      block(
        "py_lambda",
        { PARAMS: "value" },
        { VALUE: expression("value * 2") },
      ),
    ]),
    category("輸入函式庫", "#8b7a59", [
      block("py_import"),
      block("py_import_from"),
      block("py_import", { MODULE: "matplotlib.pyplot", ALIAS: "plt" }),
      block("py_import_from", { MODULE: "math", NAMES: "sqrt as root" }),
    ]),
    category("流程控制", "#539d6e", [
      condition(),
      condition(0, true),
      condition(1),
      condition(1, true),
      ...loops(),
      block("py_try"),
      block("py_raise", {}, { ERROR: expression('ValueError("發生錯誤")') }),
      block("py_assert", {}, { TEST: true, MESSAGE: "條件不符合" }),
      block(
        "py_with",
        { AS: "file" },
        { CONTEXT: expression("open('example.txt', 'r')") },
      ),
    ]),
    category(
      "圖表",
      "#509aaa",
      CALL_SPECS.filter((spec) => spec.name.startsWith("plt.")).map((spec) =>
        callBlock(spec.type),
      ),
    ),
    category("工具", "#4f9e98", tools()),
    turtles(),
    category("檔案", "#6e87a6", [
      block(
        "py_with",
        { AS: "file" },
        { CONTEXT: expression("open('example.txt', 'r')") },
      ),
      ...calls(
        "python_open",
        "method_read",
        "method_readlines",
        "method_write",
        "method_writelines",
      ),
    ]),
    category("資料轉換", "#4f9e98", conversion(true)),
    category(
      "內建函式",
      "#588ab5",
      calls(
        "python_len",
        "python_sorted",
        "python_enumerate",
        "python_reversed",
        "python_range",
        "python_min",
        "python_max",
        "python_sum",
        "python_all",
        "python_any",
        "python_zip",
        "python_map",
        "python_filter",
      ),
    ),
    category("資料串資料操作", "#5b86bd", [
      ...lists(),
      ...calls("method_pop", "method_clear"),
    ]),
    category(
      "字串資料操作",
      "#4f9e98",
      calls(
        "method_startswith",
        "method_endswith",
        "method_replace",
        "method_lower",
        "method_upper",
        "method_title",
        "method_strip",
        "method_split",
        "method_join",
        "method_format",
      ),
    ),
    category("資料串切片操作", "#588ab5", [
      block("py_index", {}, { OBJECT: expression("items"), INDEX: 0 }),
      block(
        "py_slice",
        {},
        { OBJECT: expression("items"), START: 0, STOP: 10 },
      ),
      block(
        "py_slice",
        {},
        { OBJECT: expression("items"), START: 0, STOP: 10, STEP: 2 },
      ),
    ]),
    category(
      "資料產生器",
      "#588ab5",
      ["list", "generator", "set", "dict"].flatMap((kind) => [
        comprehension(kind, false),
        comprehension(kind, true),
      ]),
    ),
    category("字典資料", "#6f8fba", dictionaries()),
    category("註解", "#8b7a59", [
      block("py_comment"),
      block("py_statement", { CODE: '"""在這裡寫下多行說明"""' }),
      block("py_statement"),
      block("py_expression"),
      block("py_expr_stmt"),
    ]),
  ];
  return {
    kind: "categoryToolbox",
    contents,
  } as Blockly.utils.toolbox.ToolboxDefinition;
}
