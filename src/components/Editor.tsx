import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentMore,
  indentLess,
} from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  bracketMatching,
  indentUnit,
} from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import {
  Blockly,
  pythonGenerator,
  toolbox as makeToolbox,
} from "../editor/blocks";
import { parsePython } from "../runtime";
import type { EditorMode, EditorApi } from "../legacy";

export function Editor({
  code,
  mode,
  toolbox,
  onChange,
  onReady,
}: {
  code: string;
  mode: EditorMode;
  toolbox: string;
  onChange(code: string): void;
  onReady(editor: EditorApi): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const blocksHost = useRef<HTMLDivElement>(null);
  const textView = useRef<EditorView | null>(null);
  const blockView = useRef<Blockly.WorkspaceSvg | null>(null);
  const latest = useRef({ code, mode, toolbox, onChange, onReady });
  latest.current = { code, mode, toolbox, onChange, onReady };
  const quiet = useRef(false);
  const generation = useRef(0);
  const changedBlocks = useRef(false);
  const [parseState, setParseState] = useState("");
  const [parseError, setParseError] = useState("");
  const [retry, setRetry] = useState(0);
  const modeSetting = useRef(new Compartment());
  async function synchronize(source: string) {
    const token = ++generation.current;
    if (latest.current.mode === "text") return;
    setParseState("正在同步方塊…");
    setParseError("");
    try {
      const result = await parsePython(source);
      if (token !== generation.current || !blockView.current) return;
      if (result.error) {
        setParseError(result.error + "。修正程式碼後會自動同步。");
        return;
      }
      quiet.current = true;
      Blockly.Events.disable();
      try {
        Blockly.serialization.workspaces.load(result.state!, blockView.current);
      } finally {
        Blockly.Events.enable();
        quiet.current = false;
      }
      blockView.current.clearUndo();
      Blockly.svgResize(blockView.current);
    } catch (error) {
      if (token === generation.current) setParseError((error as Error).message);
    } finally {
      if (token === generation.current) setParseState("");
    }
  }
  useEffect(() => {
    const cm = new EditorView({
      parent: textHost.current!,
      state: EditorState.create({
        doc: latest.current.code,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          python(),
          syntaxHighlighting(defaultHighlightStyle),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          indentUnit.of("    "),
          keymap.of([
            { key: "Tab", run: indentMore },
            { key: "Shift-Tab", run: indentLess },
            {
              key: "Escape",
              run: (view) => {
                view.contentDOM.blur();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          EditorView.contentAttributes.of({
            "aria-label": "Python 程式碼",
            "aria-describedby": "editor-keyboard-help",
            "data-editor-input": "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !quiet.current)
              latest.current.onChange(update.state.doc.toString());
          }),
          modeSetting.current.of(EditorView.editable.of(true)),
        ],
      }),
    });
    textView.current = cm;
    const workspace = Blockly.inject(blocksHost.current!, {
      toolbox: makeToolbox(latest.current.toolbox === "full"),
      media: import.meta.env.BASE_URL + "vendor/blockly/",
      renderer: "zelos",
      sounds: false,
      trashcan: true,
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        minScale: 0.35,
        maxScale: 2.2,
      },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    blockView.current = workspace;
    workspace.registerButtonCallback("BOYO_CREATE_VARIABLE", () =>
      Blockly.Variables.createVariableButtonHandler(workspace),
    );
    const api: EditorApi = {
      getCode: () => cm.state.doc.toString(),
      setCode(value) {
        cm.dispatch({
          changes: { from: 0, to: cm.state.doc.length, insert: value },
        });
      },
      focus: () => cm.focus(),
    };
    workspace.addChangeListener((event) => {
      if (
        quiet.current ||
        event.isUiEvent ||
        event.type === Blockly.Events.FINISHED_LOADING
      )
        return;
      if (workspace.isDragging()) {
        changedBlocks.current = true;
        return;
      }
      generation.current++;
      setParseState("");
      setParseError("");
      const next = pythonGenerator.workspaceToCode(workspace);
      quiet.current = true;
      cm.dispatch({
        changes: { from: 0, to: cm.state.doc.length, insert: next },
      });
      quiet.current = false;
      changedBlocks.current = true;
      latest.current.onChange(next);
    });
    latest.current.onReady(api);
    const observer = new ResizeObserver(() => {
      if (host.current?.clientHeight) {
        cm.requestMeasure();
        Blockly.svgResize(workspace);
      }
    });
    observer.observe(host.current!);
    const resize = () => {
      cm.requestMeasure();
      Blockly.svgResize(workspace);
    };
    window.addEventListener("resize", resize);
    return () => {
      generation.current++;
      observer.disconnect();
      window.removeEventListener("resize", resize);
      workspace.dispose();
      cm.destroy();
      blockView.current = null;
      textView.current = null;
    };
  }, []);
  useEffect(() => {
    const cm = textView.current;
    if (cm && cm.state.doc.toString() !== code) {
      quiet.current = true;
      cm.dispatch({
        changes: { from: 0, to: cm.state.doc.length, insert: code },
      });
      quiet.current = false;
    }
    if (changedBlocks.current) {
      changedBlocks.current = false;
      return;
    }
    if (mode !== "text") {
      setParseState("正在同步方塊…");
      setParseError("");
    }
    const timeout = setTimeout(() => synchronize(code), 160);
    return () => clearTimeout(timeout);
  }, [code, mode, retry]);
  useEffect(() => {
    blockView.current?.updateToolbox(makeToolbox(toolbox === "full"));
  }, [toolbox]);
  useEffect(() => {
    blockView.current?.setVisible(mode !== "text");
    textView.current?.requestMeasure();
    if (blockView.current) Blockly.svgResize(blockView.current);
  }, [mode]);
  return (
    <div ref={host} className={`editor-wrap modern-editor mode-${mode}`}>
      {mode !== "text" && (parseState || parseError) && (
        <div
          className={`block-sync-status ${parseError ? "has-error" : ""}`}
          role="status"
        >
          {parseError ? (
            <TriangleAlert size={15} />
          ) : (
            <LoaderCircle className="spin" size={15} />
          )}
          {parseError || parseState}
          {parseError && (
            <button onClick={() => setRetry((value) => value + 1)}>重試</button>
          )}
        </div>
      )}
      <div className="editor-surfaces">
        <div
          ref={blocksHost}
          className="blocks-host"
          inert={!!parseState || !!parseError}
          aria-busy={!!parseState}
          aria-label="Python 方塊編輯器"
          role="region"
        />
        <div ref={textHost} className="text-host" />
      </div>
    </div>
  );
}
