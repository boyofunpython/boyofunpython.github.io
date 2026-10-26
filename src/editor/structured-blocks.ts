import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";

type Part = {
  kind: "value" | "text" | "body" | "choice";
  name: string;
  label: string;
  value?: string;
  options?: string[];
};
const v = (name: string, label: string): Part => ({
  kind: "value",
  name,
  label,
});
const f = (name: string, label: string, value: string): Part => ({
  kind: "text",
  name,
  label,
  value,
});
const b = (name: string, label: string): Part => ({
  kind: "body",
  name,
  label,
});
function define(
  type: string,
  label: string,
  parts: Part[],
  expression = false,
  colour = 260,
) {
  Blockly.common.defineBlocksWithJsonArray([
    {
      type,
      message0:
        label + parts.map((part, i) => ` ${part.label} %${i + 1}`).join(""),
      args0: parts.map((part) =>
        part.kind === "text"
          ? { type: "field_input", name: part.name, text: part.value }
          : part.kind === "choice"
            ? {
                type: "field_dropdown",
                name: part.name,
                options: part.options!.map((value) => [value, value]),
              }
            : {
                type: part.kind === "body" ? "input_statement" : "input_value",
                name: part.name,
              },
      ),
      colour,
      ...(expression
        ? { output: null }
        : { previousStatement: null, nextStatement: null }),
    },
  ]);
}
const value = (block: Blockly.Block, name: string, fallback = "None") =>
  pythonGenerator.valueToCode(block, name, Order.NONE) || fallback;
const body = (block: Blockly.Block, name: string) =>
  pythonGenerator.statementToCode(block, name) || "    pass\n";
const field = (block: Blockly.Block, name: string) =>
  String(block.getFieldValue(name) ?? "").trim();

define(
  "py_function",
  "定義函式",
  [
    f("NAME", "名稱", "function"),
    f("PARAMS", "參數", "value"),
    f("RETURNS", "回傳型態（選填）", ""),
    b("BODY", "內容"),
  ],
  false,
  300,
);
define(
  "py_class",
  "定義類別",
  [
    f("NAME", "名稱", "Example"),
    f("BASES", "父類別（選填）", ""),
    b("BODY", "內容"),
  ],
  false,
  270,
);
define("py_import", "匯入函式庫", [
  f("MODULE", "名稱", "random"),
  f("ALIAS", "別名（選填）", ""),
]);
define("py_import_from", "從函式庫匯入", [
  f("MODULE", "函式庫", "math"),
  f("NAMES", "名稱（可含 as 別名）", "sqrt"),
]);
define("py_with", "使用資源", [
  v("CONTEXT", "資源"),
  f("AS", "命名為（選填）", "file"),
  b("BODY", "執行"),
]);
define(
  "py_try",
  "嘗試執行",
  [
    b("BODY", "程式"),
    f("EXCEPTION", "捕捉例外", "Exception"),
    f("NAME", "命名為（選填）", "error"),
    b("HANDLER", "處理"),
    b("ELSE", "沒有例外時（選填）"),
    b("FINALLY", "最後執行（選填）"),
  ],
  false,
  130,
);
define("py_raise", "拋出例外", [v("ERROR", "例外")], false, 130);
define(
  "py_assert",
  "確認條件",
  [v("TEST", "條件"), v("MESSAGE", "失敗訊息（選填）")],
  false,
  130,
);
define("py_yield", "產生資料 yield", [v("VALUE", "資料")], false, 300);
define(
  "py_lambda",
  "匿名函式 lambda",
  [f("PARAMS", "參數", "value"), v("VALUE", "回傳值")],
  true,
  300,
);
define(
  "py_attribute",
  "物件屬性",
  [v("OBJECT", "物件"), f("ATTR", "屬性", "name")],
  true,
  270,
);
define(
  "py_annotation",
  "標註資料型態",
  [f("NAME", "名稱", "value"), v("TYPE", "型態"), v("VALUE", "初始值（選填）")],
  false,
  270,
);
define(
  "py_index",
  "取得項目",
  [v("OBJECT", "資料"), v("INDEX", "索引或鍵")],
  true,
  220,
);
define(
  "py_slice",
  "取得切片",
  [
    v("OBJECT", "資料"),
    v("START", "起點（選填）"),
    v("STOP", "終點（選填）"),
    v("STEP", "間隔（選填）"),
  ],
  true,
  220,
);
define(
  "py_unary",
  "一元運算",
  [
    {
      kind: "choice",
      name: "OP",
      label: "運算子",
      options: ["-", "+", "~", "not"],
    },
    v("VALUE", "數值或條件"),
  ],
  true,
  190,
);

pythonGenerator.forBlock["py_function"] = (block) =>
  `def ${field(block, "NAME")}(${field(block, "PARAMS")})${field(block, "RETURNS") ? " -> " + field(block, "RETURNS") : ""}:\n${body(block, "BODY")}`;
pythonGenerator.forBlock["py_class"] = (block) =>
  `class ${field(block, "NAME")}${field(block, "BASES") ? "(" + field(block, "BASES") + ")" : ""}:\n${body(block, "BODY")}`;
pythonGenerator.forBlock["py_import"] = (block) =>
  `import ${field(block, "MODULE")}${field(block, "ALIAS") ? " as " + field(block, "ALIAS") : ""}\n`;
pythonGenerator.forBlock["py_import_from"] = (block) =>
  `from ${field(block, "MODULE")} import ${field(block, "NAMES")}\n`;
pythonGenerator.forBlock["py_with"] = (block) =>
  `with ${value(block, "CONTEXT")}${field(block, "AS") ? " as " + field(block, "AS") : ""}:\n${body(block, "BODY")}`;
pythonGenerator.forBlock["py_try"] = (block) =>
  `try:\n${body(block, "BODY")}except${field(block, "EXCEPTION") ? " " + field(block, "EXCEPTION") : ""}${field(block, "EXCEPTION") && field(block, "NAME") ? " as " + field(block, "NAME") : ""}:\n${body(block, "HANDLER")}${block.getInputTargetBlock("ELSE") ? "else:\n" + body(block, "ELSE") : ""}${block.getInputTargetBlock("FINALLY") ? "finally:\n" + body(block, "FINALLY") : ""}`;
pythonGenerator.forBlock["py_raise"] = (block) =>
  `raise${block.getInputTargetBlock("ERROR") ? " " + value(block, "ERROR") : ""}\n`;
pythonGenerator.forBlock["py_assert"] = (block) =>
  `assert ${value(block, "TEST", "True")}${block.getInputTargetBlock("MESSAGE") ? ", " + value(block, "MESSAGE") : ""}\n`;
pythonGenerator.forBlock["py_yield"] = (block) =>
  `yield ${value(block, "VALUE")}\n`;
pythonGenerator.forBlock["py_lambda"] = (block) => [
  `(lambda ${field(block, "PARAMS")}: ${value(block, "VALUE")})`,
  Order.ATOMIC,
];
pythonGenerator.forBlock["py_attribute"] = (block) => [
  `(${value(block, "OBJECT")}).${field(block, "ATTR")}`,
  Order.MEMBER,
];
pythonGenerator.forBlock["py_annotation"] = (block) =>
  `${field(block, "NAME")}: ${value(block, "TYPE", "int")}${block.getInputTargetBlock("VALUE") ? " = " + value(block, "VALUE") : ""}\n`;
pythonGenerator.forBlock["py_index"] = (block) => [
  `(${value(block, "OBJECT")})[${value(block, "INDEX", "0")}]`,
  Order.MEMBER,
];
pythonGenerator.forBlock["py_slice"] = (block) => [
  `(${value(block, "OBJECT")})[${value(block, "START", "")}:${value(block, "STOP", "")}${block.getInputTargetBlock("STEP") ? ":" + value(block, "STEP") : ""}]`,
  Order.MEMBER,
];
pythonGenerator.forBlock["py_unary"] = (block) => [
  `(${field(block, "OP")} (${value(block, "VALUE", "0")}))`,
  Order.ATOMIC,
];

for (const [kind, label, brackets] of [
  ["list", "資料串產生式", ["[", "]"]],
  ["generator", "產生器運算式", ["(", ")"]],
  ["set", "集合產生式", ["{", "}"]],
  ["dict", "字典產生式", ["{", "}"]],
] as const) {
  const type = "py_comprehension_" + kind;
  define(
    type,
    label,
    [
      ...(kind === "dict" ? [v("KEY", "鍵")] : []),
      v("VALUE", kind === "dict" ? "值" : "每項資料"),
      f("VAR", "變數", "item"),
      v("ITER", "來源"),
      v("TEST", "條件（選填）"),
    ],
    true,
    220,
  );
  pythonGenerator.forBlock[type] = (block) => [
    `${brackets[0]}${kind === "dict" ? value(block, "KEY") + ": " : ""}${value(block, "VALUE")} for ${field(block, "VAR")} in (${value(block, "ITER", "[]")})${block.getInputTargetBlock("TEST") ? " if (" + value(block, "TEST") + ")" : ""}${brackets[1]}`,
    Order.ATOMIC,
  ];
}

type CollectionBlock = Blockly.Block & { itemCount_: number };
for (const [type, label, pair] of [
  ["py_tuple", "元組 tuple", false],
  ["py_set", "集合 set", false],
  ["py_dict", "字典 dict", true],
] as const) {
  const names = (index: number) =>
    pair ? ["KEY" + index, "VALUE" + index] : ["ITEM" + index];
  function shape(block: CollectionBlock, count: number) {
    for (let i = count; i < block.itemCount_; i++)
      for (const name of names(i)) block.removeInput(name);
    for (let i = 0; i < count; i++)
      for (const name of names(i))
        if (!block.getInput(name))
          block
            .appendValueInput(name)
            .appendField(
              pair ? (name.startsWith("KEY") ? "鍵" : "值") : "項目 " + (i + 1),
            );
    block.itemCount_ = count;
  }
  Blockly.Blocks[type] = {
    init(this: CollectionBlock) {
      this.itemCount_ = 0;
      const count = new Blockly.FieldNumber(3, 0, 32, 1);
      this.appendDummyInput()
        .appendField(label)
        .appendField("數量")
        .appendField(count, "COUNT");
      count.setValidator((value) => {
        if (Number(value) !== this.itemCount_) shape(this, Number(value));
        return value;
      });
      shape(this, 3);
      this.setOutput(true);
      this.setColour(220);
    },
    saveExtraState(this: CollectionBlock) {
      return { count: this.itemCount_ };
    },
    loadExtraState(this: CollectionBlock, state: { count: number }) {
      shape(this, Math.max(0, Math.min(32, state.count)));
      this.setFieldValue(String(this.itemCount_), "COUNT");
    },
  };
  pythonGenerator.forBlock[type] = (block) => {
    const count = (block as CollectionBlock).itemCount_;
    const values = Array.from({ length: count }, (_, i) =>
      pair
        ? `${value(block, "KEY" + i)}: ${value(block, "VALUE" + i)}`
        : value(block, "ITEM" + i),
    );
    return [
      pair
        ? `{${values.join(", ")}}`
        : type === "py_set"
          ? count
            ? `{${values.join(", ")}}`
            : "set()"
          : `(${values.join(", ")}${count === 1 ? "," : ""})`,
      Order.ATOMIC,
    ];
  };
}
