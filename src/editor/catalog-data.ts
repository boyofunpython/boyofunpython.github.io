/** Maintained equivalents of the legacy normal/full toolbox call blocks. */
export type Seed = string | number | boolean | null | Seed[] | { code: string };
export type CallArgument = {
  name: string;
  label: string;
  value: Seed;
  keyword?: string;
};
export type CallSpec = {
  type: string;
  name: string;
  label: string;
  args: CallArgument[];
  result: boolean;
  import?: string;
  receiver?: Seed;
  aliases?: string[];
};
const arg = (
  name: string,
  label: string,
  value: Seed,
  keyword?: string,
): CallArgument => ({ name, label, value, keyword });
const expr = (code: string): Seed => ({ code });
const call = (
  type: string,
  name: string,
  label: string,
  args: CallArgument[] = [],
  result = true,
  extra: Partial<CallSpec> = {},
): CallSpec => ({ type, name, label, args, result, ...extra });
const turtle = (
  name: string,
  label: string,
  args: CallArgument[] = [],
  result = false,
  extra: Partial<CallSpec> = {},
) =>
  call("turtle_" + name, "turtle." + name, "🐢 " + label, args, result, {
    import: "import turtle",
    ...extra,
  });
const builtin = (name: string, label: string, args: CallArgument[] = []) =>
  call("python_" + name, name, label, args);
const method = (
  name: string,
  label: string,
  receiver: Seed,
  args: CallArgument[] = [],
  result = true,
  type = name,
) => call("method_" + type, "." + name, label, args, result, { receiver });
const plot = (name: string, label: string, args: CallArgument[] = []) =>
  call("plot_" + name, "plt." + name, label, args, false, {
    import: "import matplotlib.pyplot as plt",
  });
const object = expr("items");
const number = (name = "VALUE", label = "數值", value = 0) =>
  arg(name, label, value);
const data = (name = "VALUE", label = "資料") => arg(name, label, object);
export const CALL_SPECS: CallSpec[] = [
  turtle("done", "顯示畫圖結果", [], false, {
    aliases: ["turtle.mainloop", "turtle.show_scene"],
  }),
  turtle("speed", "設定速度", [number("SPEED", "速度（0～10）", 10)]),
  turtle("set_defaults", "設定畫布大小", [
    arg("WIDTH", "寬度", 500, "canvwidth"),
    arg("HEIGHT", "高度", 500, "canvheight"),
  ]),
  turtle("forward", "前進", [number("DISTANCE", "距離", 50)], false, {
    aliases: ["turtle.fd"],
  }),
  turtle("backward", "後退", [number("DISTANCE", "距離", 50)], false, {
    aliases: ["turtle.back", "turtle.bk", "turtle.bd"],
  }),
  turtle("right", "向右轉", [number("ANGLE", "角度", 90)], false, {
    aliases: ["turtle.rt"],
  }),
  turtle("left", "向左轉", [number("ANGLE", "角度", 90)], false, {
    aliases: ["turtle.lt"],
  }),
  turtle("setheading", "設定方向", [number("ANGLE", "角度", 270)], false, {
    aliases: ["turtle.seth"],
  }),
  turtle("goto", "移到座標", [number("X", "x"), number("Y", "y")], false, {
    aliases: ["turtle.setpos", "turtle.setposition"],
  }),
  turtle("setx", "設定 x 座標", [number("X", "x", 100)]),
  turtle("sety", "設定 y 座標", [number("Y", "y", 100)]),
  turtle("pendown", "放下畫筆", [], false, {
    aliases: ["turtle.pd", "turtle.down"],
  }),
  turtle("penup", "提起畫筆", [], false, {
    aliases: ["turtle.pu", "turtle.up"],
  }),
  turtle("pensize", "設定畫筆寬度", [number("WIDTH", "寬度", 5)], false, {
    aliases: ["turtle.width"],
  }),
  turtle("pencolor", "設定畫筆顏色", [arg("COLOR", "顏色", "blue")]),
  turtle("fillcolor", "設定填滿顏色", [arg("COLOR", "顏色", "blue")]),
  turtle("bgcolor", "設定背景顏色", [arg("COLOR", "顏色", "white")]),
  turtle("begin_fill", "開始填滿顏色"),
  turtle("end_fill", "結束填滿顏色"),
  turtle("write", "寫字", [arg("TEXT", "文字", "Hello World")]),
  turtle("position", "取得目前位置", [], true, { aliases: ["turtle.pos"] }),
  turtle("circle", "畫圓", [number("RADIUS", "半徑", 50)]),
  turtle("stamp", "蓋上海龜印章", [], true),
  call(
    "turtle_write_styled",
    "turtle.write",
    "🐢 設定字型寫字",
    [
      arg("TEXT", "文字", "你想說什麼呢？"),
      arg("FONT", "字型、大小與樣式", expr("('標楷體', 24, 'bold')"), "font"),
      arg("COLOR", "顏色", "blue", "color"),
      arg("ALIGN", "對齊（left／center／right）", "center", "align"),
    ],
    false,
    { import: "import turtle" },
  ),
  turtle("home", "回到原點"),
  turtle("dot", "畫一個點", [
    number("SIZE", "大小", 20),
    arg("COLOR", "顏色", "red"),
  ]),
  turtle("hideturtle", "隱藏海龜", [], false, { aliases: ["turtle.ht"] }),
  turtle("showturtle", "顯示海龜", [], false, { aliases: ["turtle.st"] }),
  turtle("heading", "取得方向", [], true),
  turtle("xcor", "取得 x 座標", [], true),
  turtle("ycor", "取得 y 座標", [], true),
  turtle(
    "distance",
    "取得到座標的距離",
    [number("X", "x"), number("Y", "y")],
    true,
  ),
  turtle(
    "towards",
    "取得朝向座標的角度",
    [number("X", "x"), number("Y", "y")],
    true,
  ),
  turtle("shape", "設定海龜形狀", [arg("SHAPE", "形狀", "turtle")]),
  turtle("tracer", "切換動畫", [
    number("ENABLED", "動畫（1 開啟／0 關閉）", 1),
  ]),
  call(
    "python_print",
    "print",
    "印出",
    [arg("VALUE", "內容", "Hello World")],
    false,
  ),
  builtin("input", "詢問並讀取輸入", [arg("PROMPT", "提示文字", "Your Name?")]),
  call("python_loadCSV", "loadCSV", "讀取 CSV", [
    arg("URL", "網路位置", "網路位置"),
  ]),
  call("python_display", "boyoDisplay", "顯示資料或圖形", [data()], false, {
    aliases: ["display"],
  }),
  call(
    "random_randint",
    "random.randint",
    "產生範圍內的隨機整數",
    [number("LOW", "最小值", 1), number("HIGH", "最大值", 100)],
    true,
    { import: "import random" },
  ),
  call(
    "random_choice",
    "random.choice",
    "抽籤（抽一個）",
    [arg("VALUES", "候選資料", ["蘋果 apple", "水蜜桃 peach"])],
    true,
    { import: "import random" },
  ),
  call(
    "random_sample",
    "random.sample",
    "抽籤（抽一群）",
    [
      arg("VALUES", "候選資料", expr("range(100)")),
      number("COUNT", "數量", 50),
    ],
    true,
    { import: "import random" },
  ),
  builtin("round", "四捨五入", [number("VALUE", "數值", 3.14)]),
  builtin("pow", "次方", [
    number("BASE", "底數", 2),
    number("POWER", "次方", 3),
  ]),
  call("python_sqrt", "sqrt", "平方根", [number("VALUE", "數值", 9)], true, {
    import: "from math import sqrt",
  }),
  builtin("abs", "絕對值", [number("VALUE", "數值", -5)]),
  builtin("int", "轉成整數", [arg("VALUE", "資料", "123")]),
  builtin("float", "轉成小數", [arg("VALUE", "資料", "3.14")]),
  builtin("str", "轉成字串", [number("VALUE", "資料", 123)]),
  builtin("bool", "轉成布林值", [number("VALUE", "資料", 1)]),
  builtin("chr", "字碼轉成字元", [number("VALUE", "Unicode 字碼", 65)]),
  ...["list", "dict", "tuple", "set", "type"].map((name) =>
    builtin(
      name,
      {
        list: "轉成資料串",
        dict: "轉成字典",
        tuple: "轉成元組",
        set: "轉成集合",
        type: "取得資料型態",
      }[name]!,
      [
        arg(
          "VALUE",
          "資料",
          name === "dict" ? expr("[('key', 1)]") : [1, 2, 3],
        ),
      ],
    ),
  ),
  builtin("isinstance", "檢查資料型態", [
    number("VALUE", "資料", 1),
    arg("TYPE", "型態", expr("int")),
  ]),
  builtin("len", "取得長度", [data()]),
  builtin("sorted", "排序", [data()]),
  builtin("enumerate", "附上索引", [data()]),
  builtin("reversed", "反向排列", [data()]),
  builtin("range", "建立數值範圍", [
    number("START", "起點", 0),
    number("STOP", "終點（不含）", 10),
    number("STEP", "間隔", 1),
  ]),
  builtin("min", "取得最小值", [
    number("A", "數值一", 1),
    number("B", "數值二", 2),
  ]),
  builtin("max", "取得最大值", [
    number("A", "數值一", 1),
    number("B", "數值二", 2),
  ]),
  ...["sum", "all", "any"].map((name) =>
    builtin(
      name,
      { sum: "加總", all: "全部成立", any: "至少一個成立" }[name]!,
      [data()],
    ),
  ),
  builtin("zip", "配對資料", [
    arg("A", "第一組", [1, 2]),
    arg("B", "第二組", ["a", "b"]),
  ]),
  builtin("map", "逐項套用函式", [
    arg("FUNCTION", "函式", expr("str")),
    data(),
  ]),
  builtin("filter", "篩選資料", [
    arg("FUNCTION", "判斷函式", expr("bool")),
    data(),
  ]),
  builtin("super", "取得父類別"),
  builtin("open", "開啟檔案", [
    arg("PATH", "檔名", "example.txt"),
    arg("MODE", "模式", "r"),
  ]),
  method("append", "加入資料串", object, [arg("VALUE", "資料", 0)], false),
  method("pop", "取出最後一項", object),
  method("clear", "清空資料", object, [], false),
  method("startswith", "字串是否以此開頭", expr("text"), [
    arg("VALUE", "開頭", ""),
  ]),
  method("endswith", "字串是否以此結尾", expr("text"), [
    arg("VALUE", "結尾", ""),
  ]),
  method("replace", "取代字串", expr("text"), [
    arg("OLD", "原文字", ""),
    arg("NEW", "新文字", ""),
  ]),
  ...["lower", "upper", "title"].map((name) =>
    method(
      name,
      { lower: "轉成小寫", upper: "轉成大寫", title: "單字首字母大寫" }[name]!,
      expr("text"),
    ),
  ),
  method("strip", "移除字串頭尾字元", expr("text"), [
    arg("CHARS", "要移除的字元", " "),
  ]),
  method("split", "分割字串", expr("text"), [arg("SEP", "分隔字元", ",")]),
  method("join", "連接成字串", ",", [data()]),
  method("format", "格式化字串", "Hello {}", [arg("VALUE", "資料", "World")]),
  method("read", "讀取檔案內容", expr("file")),
  method("readlines", "逐行讀取檔案", expr("file")),
  method("write", "寫入檔案", expr("file"), [arg("TEXT", "內容", "Hello\n")]),
  method(
    "writelines",
    "寫入多行資料",
    expr("file"),
    [arg("LINES", "各行內容", ["第一行\n", "第二行\n"])],
    false,
  ),
  plot("plot", "畫折線圖", [arg("VALUES", "數值", [1, 3, 2])]),
  plot("scatter", "畫散佈圖", [
    arg("X", "x 座標", [1, 2, 3]),
    arg("Y", "y 座標", [2, 4, 3]),
  ]),
  plot("hist", "畫直方圖", [arg("VALUES", "數值", [1, 1, 2, 3])]),
  plot("bar", "畫長條圖", [
    arg("X", "位置", [1, 2, 3]),
    arg("HEIGHT", "高度", [2, 4, 3]),
    arg("LABELS", "標籤", ["A", "B", "C"], "tick_label"),
  ]),
  plot("boxplot", "畫盒鬚圖", [arg("VALUES", "數值", [1, 2, 3, 4])]),
  plot("show", "顯示圖表"),
  plot("title", "設定圖表標題", [arg("TEXT", "標題", "圖表標題")]),
  plot("xlabel", "設定 x 軸標籤", [arg("TEXT", "標籤", "x")]),
  plot("ylabel", "設定 y 軸標籤", [arg("TEXT", "標籤", "y")]),
  plot("hlines", "畫水平線", [
    number("Y", "y", 1),
    number("START", "x 起點", 0),
    number("STOP", "x 終點", 10),
  ]),
  plot("vlines", "畫垂直線", [
    number("X", "x", 1),
    number("START", "y 起點", 0),
    number("STOP", "y 終點", 10),
  ]),
];
