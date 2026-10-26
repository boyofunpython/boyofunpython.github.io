import * as Blockly from "blockly/core";
import "blockly/blocks";
import { pythonGenerator, Order } from "blockly/python";
import * as zh from "blockly/msg/zh-hant";
import { registerFieldMultilineInput } from "@blockly/field-multilineinput";
registerFieldMultilineInput();

const locale: Record<string, string> = {};
for (const [key, value] of Object.entries(zh))
  if (typeof value === "string") locale[key] = value;
Blockly.setLocale(locale);
const statement = { previousStatement: null, nextStatement: null };
Blockly.common.defineBlocksWithJsonArray([
  {
    type: "py_assign",
    message0: "設定 %1 為 %2",
    args0: [
      { type: "field_input", name: "NAME", text: "name" },
      { type: "input_value", name: "VALUE" },
    ],
    colour: 220,
    ...statement,
  },
  {
    type: "py_name",
    message0: "%1",
    args0: [{ type: "field_input", name: "NAME", text: "name" }],
    output: null,
    colour: 220,
  },
  {
    type: "py_number",
    message0: "%1",
    args0: [{ type: "field_input", name: "NUM", text: "0" }],
    output: null,
    colour: 180,
  },
  {
    type: "py_literal",
    message0: "%1",
    args0: [
      {
        type: "field_dropdown",
        name: "VALUE",
        options: [
          ["True", "True"],
          ["False", "False"],
          ["None", "None"],
        ],
      },
    ],
    output: null,
    colour: 180,
  },
  {
    type: "py_expr_stmt",
    message0: "%1",
    args0: [{ type: "input_value", name: "VALUE" }],
    colour: 165,
    ...statement,
  },
  {
    type: "py_binary",
    message0: "%1 %2 %3",
    args0: [
      { type: "input_value", name: "LEFT" },
      {
        type: "field_dropdown",
        name: "OP",
        options: [
          "+",
          "-",
          "*",
          "/",
          "//",
          "%",
          "**",
          "==",
          "!=",
          "<",
          "<=",
          ">",
          ">=",
          "and",
          "or",
          "in",
          "not in",
          "is",
          "is not",
          "&",
          "|",
          "^",
          "<<",
          ">>",
        ].map((value) => [value, value]),
      },
      { type: "input_value", name: "RIGHT" },
    ],
    inputsInline: true,
    output: null,
    colour: 190,
  },
  {
    type: "py_if",
    message0: "如果 %1",
    args0: [{ type: "input_value", name: "TEST" }],
    message1: "就 %1",
    args1: [{ type: "input_statement", name: "THEN" }],
    message2: "否則 %1",
    args2: [{ type: "input_statement", name: "ELSE" }],
    colour: 285,
    ...statement,
  },
  {
    type: "py_for",
    message0: "讓 %1 依序取出 %2",
    args0: [
      { type: "field_input", name: "NAME", text: "number" },
      { type: "input_value", name: "ITER" },
    ],
    message1: "執行 %1",
    args1: [{ type: "input_statement", name: "BODY" }],
    colour: 130,
    ...statement,
  },
  {
    type: "py_while",
    message0: "當 %1",
    args0: [{ type: "input_value", name: "TEST" }],
    message1: "重複 %1",
    args1: [{ type: "input_statement", name: "BODY" }],
    colour: 130,
    ...statement,
  },
  {
    type: "py_return",
    message0: "回傳 %1",
    args0: [{ type: "input_value", name: "VALUE" }],
    colour: 300,
    ...statement,
  },
  {
    type: "py_keyword",
    message0: "%1",
    args0: [
      {
        type: "field_dropdown",
        name: "KEYWORD",
        options: ["pass", "break", "continue", "return"].map((value) => [
          value,
          value,
        ]),
      },
    ],
    colour: 300,
    ...statement,
  },
  {
    type: "py_comment",
    message0: "# %1",
    args0: [{ type: "field_input", name: "TEXT", text: "在這裡寫下說明" }],
    colour: 60,
    ...statement,
  },
  {
    type: "py_statement",
    message0: "Python %1",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "pass" }],
    colour: 260,
    ...statement,
  },
  {
    type: "py_expression",
    message0: "運算式 %1",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "range(10)" }],
    output: null,
    colour: 260,
  },
]);
type CallBlock = Blockly.Block & { argCount_: number; keywords_: string[] };
function callShape(
  block: CallBlock,
  count: number,
  keywords = block.keywords_ ?? [],
) {
  for (let i = count; i < (block.argCount_ ?? 0); i++)
    block.removeInput("ARG" + i);
  for (let i = 0; i < count; i++)
    if (!block.getInput("ARG" + i))
      block
        .appendValueInput("ARG" + i)
        .appendField(keywords[i] || `參數 ${i + 1}`, "LABEL" + i);
  for (let i = 0; i < count; i++)
    block.getField("LABEL" + i)?.setValue(keywords[i] || `參數 ${i + 1}`);
  block.argCount_ = count;
  block.keywords_ = Array.from({ length: count }, (_, i) => keywords[i] || "");
}
Blockly.Blocks["py_call"] = {
  init(this: CallBlock) {
    this.argCount_ = 0;
    this.keywords_ = [];
    this.appendDummyInput()
      .appendField("呼叫")
      .appendField(new Blockly.FieldTextInput("print"), "FUNC")
      .appendField("參數")
      .appendField(
        new Blockly.FieldNumber(1, 0, 32, 1, (value) => {
          if (Number(value) !== this.argCount_) callShape(this, Number(value));
          return value;
        }),
        "COUNT",
      );
    this.setOutput(true);
    this.setColour(165);
    callShape(this, 1);
  },
  saveExtraState(this: CallBlock) {
    return { count: this.argCount_, keywords: this.keywords_ };
  },
  loadExtraState(
    this: CallBlock,
    state: { count: number; keywords?: string[] },
  ) {
    callShape(this, Math.max(0, Math.min(32, state.count)), state.keywords);
    this.setFieldValue(String(this.argCount_), "COUNT");
  },
};
const value = (block: Blockly.Block, input: string, fallback = "None") =>
  pythonGenerator.valueToCode(block, input, Order.NONE) || fallback;
const body = (block: Blockly.Block, input: string) =>
  pythonGenerator.statementToCode(block, input) || "    pass\n";
pythonGenerator.INDENT = "    ";
pythonGenerator.forBlock["py_name"] = (block) => [
  String(block.getFieldValue("NAME")),
  Order.ATOMIC,
];
pythonGenerator.forBlock["py_number"] = (block) => [
  String(block.getFieldValue("NUM")),
  Order.ATOMIC,
];
pythonGenerator.forBlock["py_literal"] = (block) => [
  String(block.getFieldValue("VALUE")),
  Order.ATOMIC,
];
pythonGenerator.forBlock["py_expression"] = (block) => [
  `(${block.getFieldValue("CODE")})`,
  Order.ATOMIC,
];
pythonGenerator.forBlock["py_binary"] = (block) => [
  `(${value(block, "LEFT", "0")} ${block.getFieldValue("OP")} ${value(block, "RIGHT", "0")})`,
  Order.ATOMIC,
];
pythonGenerator.forBlock["py_call"] = (block) => {
  const call = block as CallBlock;
  const args = Array.from(
    { length: call.argCount_ },
    (_, i) => (call.keywords_[i] ?? "") + value(block, "ARG" + i),
  );
  return [
    `${block.getFieldValue("FUNC")}(${args.join(", ")})`,
    Order.FUNCTION_CALL,
  ];
};
pythonGenerator.forBlock["py_assign"] = (block) =>
  `${block.getFieldValue("NAME")} = ${value(block, "VALUE")}\n`;
pythonGenerator.forBlock["py_expr_stmt"] = (block) =>
  `${value(block, "VALUE")}\n`;
pythonGenerator.forBlock["py_if"] = (block) =>
  `if ${value(block, "TEST", "True")}:\n${body(block, "THEN")}${block.getInputTargetBlock("ELSE") ? "else:\n" + body(block, "ELSE") : ""}`;
pythonGenerator.forBlock["py_for"] = (block) =>
  `for ${block.getFieldValue("NAME")} in ${value(block, "ITER", "range(10)")}:\n${body(block, "BODY")}`;
pythonGenerator.forBlock["py_while"] = (block) =>
  `while ${value(block, "TEST", "True")}:\n${body(block, "BODY")}`;
pythonGenerator.forBlock["py_return"] = (block) =>
  `return ${value(block, "VALUE")}\n`;
pythonGenerator.forBlock["py_keyword"] = (block) =>
  `${block.getFieldValue("KEYWORD")}\n`;
pythonGenerator.forBlock["py_comment"] = (block) =>
  `#${block.getFieldValue("TEXT")}\n`;
pythonGenerator.forBlock["py_statement"] = (block) =>
  String(block.getFieldValue("CODE")).replace(/\n?$/, "\n");
const block = (
  type: string,
  fields?: Record<string, string>,
  extraState?: unknown,
) => ({ kind: "block", type, fields, extraState });
const category = (name: string, colour: string, contents: unknown[]) => ({
  kind: "category",
  name,
  colour,
  contents,
});
export function toolbox(
  full: boolean,
): Blockly.utils.toolbox.ToolboxDefinition {
  const contents = [
    category("變數", "#586baa", [block("py_assign"), block("py_name")]),
    category("資料數值", "#539e84", [
      block("text"),
      block("py_number"),
      block("py_literal"),
      block("lists_create_with"),
    ]),
    category("輸出與輸入", "#4f9e98", [
      block("py_expr_stmt", undefined, undefined),
      block("py_call", { FUNC: "print" }, { count: 1 }),
      block("py_call", { FUNC: "input" }, { count: 1 }),
    ]),
    category("數學運算", "#509aaa", [
      block("py_binary"),
      block("math_arithmetic"),
      block("math_round"),
    ]),
    category("條件判斷", "#9b6aba", [
      block("py_if"),
      block("logic_compare"),
      block("logic_negate"),
    ]),
    category("迴圈", "#539d6e", [
      block("py_for"),
      block("py_call", { FUNC: "range" }, { count: 1 }),
      block("py_while"),
      block("py_keyword"),
    ]),
    category("繪圖 🐢", "#4f9d82", [
      block("py_statement", { CODE: "import turtle" }),
      block("py_call", { FUNC: "turtle.forward" }, { count: 1 }),
      block("py_call", { FUNC: "turtle.right" }, { count: 1 }),
      block("py_call", { FUNC: "turtle.done" }, { count: 0 }),
    ]),
  ];
  if (full)
    contents.push(
      category("Python 與註解", "#8b7a59", [
        block("py_comment"),
        block("py_statement"),
        block("py_expression"),
        block("py_return"),
        block("lists_length"),
        block("text_join"),
      ]),
    );
  return {
    kind: "categoryToolbox",
    contents,
  } as Blockly.utils.toolbox.ToolboxDefinition;
}
export { Blockly, pythonGenerator };
