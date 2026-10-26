import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { CALL_SPECS, type Seed } from "./catalog-data";

export function seed(value: Seed): Record<string, unknown> {
  if (Array.isArray(value))
    return {
      type: "lists_create_with",
      extraState: { itemCount: value.length },
      inputs: Object.fromEntries(
        value.map((item, i) => ["ADD" + i, { shadow: seed(item) }]),
      ),
    };
  if (value && typeof value === "object")
    return { type: "py_expression", fields: { CODE: value.code } };
  if (typeof value === "number")
    return { type: "py_number", fields: { NUM: String(value) } };
  if (typeof value === "string")
    return { type: "text", fields: { TEXT: value } };
  return {
    type: "py_literal",
    fields: { VALUE: value === null ? "None" : value ? "True" : "False" },
  };
}
export function callBlock(type: string) {
  const spec = CALL_SPECS.find((item) => item.type === type)!;
  const inputs = Object.fromEntries(
    spec.args.map((arg) => [arg.name, { shadow: seed(arg.value) }]),
  );
  if (spec.receiver !== undefined)
    inputs.OBJECT = { shadow: seed(spec.receiver) };
  return { kind: "block", type, inputs };
}
for (const spec of CALL_SPECS) {
  const args = [
    ...(spec.receiver === undefined ? [] : [{ name: "OBJECT", label: "對象" }]),
    ...spec.args,
  ];
  Blockly.common.defineBlocksWithJsonArray([
    {
      type: spec.type,
      message0:
        spec.label + args.map((arg, i) => ` ${arg.label} %${i + 1}`).join(""),
      args0: args.map((arg) => ({ type: "input_value", name: arg.name })),
      inputsInline: args.length < 3,
      colour: spec.name.startsWith("turtle.")
        ? 155
        : spec.name.startsWith("plt.")
          ? 200
          : 210,
      ...(spec.result
        ? { output: null }
        : { previousStatement: null, nextStatement: null }),
    },
  ]);
  pythonGenerator.forBlock[spec.type] = (block) => {
    if (spec.import)
      pythonGenerator.provideFunction_(
        "catalog_" + spec.import.replace(/\W+/g, "_"),
        spec.import,
      );
    const name =
      spec.receiver === undefined
        ? spec.name
        : `${pythonGenerator.valueToCode(block, "OBJECT", Order.MEMBER) || "items"}${spec.name}`;
    const args = spec.args.map(
      (arg) =>
        (arg.keyword ? arg.keyword + "=" : "") +
        (pythonGenerator.valueToCode(block, arg.name, Order.NONE) || "None"),
    );
    const code = `${name}(${args.join(", ")})`;
    return spec.result ? [code, Order.FUNCTION_CALL] : code + "\n";
  };
}
