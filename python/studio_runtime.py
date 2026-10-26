"""Boyo Python Studio 2: shared learner namespace, real input and SVG output."""
import asyncio
import builtins
import codeop
import csv
import io
import json
import math
import base64
import rlcompleter
import sys
import traceback
import ast
from pyodide.code import eval_code_async
from pyodide.ffi import can_run_sync, run_sync, jsnull
from boyo import write as _write, request_input as _request_input, document as _document
import boyo_turtle
sys.modules['turtle'] = boyo_turtle
sys.modules['myturtle'] = boyo_turtle

_namespace = {'__name__': '__main__'}
_console_buffer = []
_current_turtle_svg = None
_last_turtle_svg = None


class StudioOutput:
    def __init__(self, stream):
        self.stream = stream

    def write(self, text):
        _write(str(text), self.stream)
        return len(text)

    def flush(self):
        pass

    def isatty(self):
        return True


def studio_input(prompt=''):
    value = _request_input(str(prompt))
    if isinstance(value, str):
        return value
    if not can_run_sync():
        raise RuntimeError('此瀏覽器尚未支援即時 input()。請在 Console 的「預先輸入」提供每行輸入，或使用支援 JSPI 的新版 Chrome。')
    result = run_sync(value)
    if result is None or result is jsnull:
        raise EOFError('輸入已取消')
    return str(result)


def _display_hook(value):
    if value is not None:
        _namespace['_'] = value
        _write(repr(value) + '\n', 'stdout')


def display(value):
    target = _document.getElementById('result')
    for method in ('_repr_svg_', '_repr_html_', '_repr_png_'):
        if not hasattr(value, method):
            continue
        formatted = getattr(value, method)()
        if formatted is None:
            continue
        if isinstance(formatted, tuple):
            formatted = formatted[0]
        if method == '_repr_png_':
            encoded = base64.b64encode(formatted).decode() if isinstance(formatted, bytes) else formatted
            target.innerHTML += f'<img alt="Python 圖形" src="data:image/png;base64,{encoded}">'
        else:
            target.innerHTML += str(formatted)
        return
    if hasattr(value, 'savefig'):
        stream = io.BytesIO()
        value.savefig(stream, format='png')
        encoded = base64.b64encode(stream.getvalue()).decode()
        target.innerHTML += f'<img alt="Python 圖形" src="data:image/png;base64,{encoded}">'
    elif isinstance(value, str) and value.lstrip().startswith('<svg'):
        target.innerHTML += value
    else:
        print(value)


def _show_plot(*args, **kwargs):
    from matplotlib import pyplot as plt
    for number in plt.get_fignums():
        display(plt.figure(number))
    plt.close('all')


def _prepare_graphics(source):
    try:
        nodes = ast.walk(ast.parse(source))
        plotting = any(isinstance(node, ast.Import) and any(alias.name.startswith('matplotlib') for alias in node.names)
                       or isinstance(node, ast.ImportFrom) and (node.module or '').startswith('matplotlib') for node in nodes)
    except SyntaxError:
        return
    if plotting:
        import matplotlib
        # Workers have no browser canvas. Render figures using Agg, then pass
        # their PNG output through the same isolated result display as SVG.
        matplotlib.use('agg')
        from matplotlib import pyplot as plt
        plt.show = _show_plot


def _turtle_done(*, automatic=False):
    global _current_turtle_svg, _last_turtle_svg
    scene = boyo_turtle.Screen().show_scene()
    target = _document.getElementById('result')
    if _current_turtle_svg is not None:
        target.innerHTML = target.innerHTML.replace(_current_turtle_svg, scene, 1)
    elif not automatic or scene != _last_turtle_svg:
        target.innerHTML += scene
    else:
        return
    _current_turtle_svg = _last_turtle_svg = scene


def _tracer(self, n=None, delay=None):
    if n is None:
        return int(self._animate)
    self.animation('off' if n == 0 else 'on')


_original_restart = boyo_turtle.restart


def _restart():
    global _last_turtle_svg
    _last_turtle_svg = None
    boyo_turtle.Screen().animation('on')
    _original_restart()


boyo_turtle.restart = _restart
boyo_turtle.done = boyo_turtle.mainloop = boyo_turtle.show_scene = _turtle_done
boyo_turtle.Screen.tracer = _tracer
builtins.input = studio_input


async def aloadCSV(path):
    from pyodide.http import pyfetch
    from urllib.parse import urljoin
    response = await pyfetch(urljoin('https://boyofunpython.ddns.net:8787/', path))
    return list(csv.reader(io.StringIO(await response.string())))


def loadCSV(path):
    return run_sync(aloadCSV(path))


_helpers = {'aloadCSV': aloadCSV, 'display': display, 'boyoDisplay': display, 'format_mime': display, 'loadCSV': loadCSV, 'sqrt': math.sqrt, 'pow': pow}
_namespace.update(_helpers)


async def _studio_execute(source, filename, mode):
    global _current_turtle_svg
    _current_turtle_svg = None
    sys.stdout, sys.stderr = StudioOutput('stdout'), StudioOutput('stderr')
    sys.displayhook = _display_hook
    builtins.input = studio_input
    _namespace['__file__'] = filename
    _prepare_graphics(source)
    if mode == 'run':
        _console_buffer.clear()
        _restart()
        value = await eval_code_async(source, globals=_namespace, filename=filename)
        if value is not None:
            display(value)
        return False
    _console_buffer.append(source)
    combined = '\n'.join(_console_buffer)
    try:
        compiled = codeop.compile_command(combined, '<博幼 Console>', 'single')
    except BaseException:
        _console_buffer.clear()
        raise
    if compiled is None:
        return True
    _console_buffer.clear()
    exec(compiled, _namespace)
    return False


def _studio_finalize():
    if boyo_turtle.Screen().turtles():
        _turtle_done(automatic=True)


async def _studio_dispatch(source, filename, mode):
    # Format learner errors before crossing into JavaScript: Pyodide's
    # exception formatter otherwise writes the traceback into redirected stderr.
    outcome = {}
    try:
        outcome['incomplete'] = await _studio_execute(source, filename, mode)
    except BaseException:
        outcome['error'] = traceback.format_exc()
    try:
        _studio_finalize()
    except BaseException:
        outcome.setdefault('error', traceback.format_exc())
    return json.dumps(outcome)


def _studio_variables():
    rows = []
    for name, value in sorted(_namespace.items()):
        if name.startswith('_') or name in _helpers and value is _helpers[name]:
            continue
        if type(value) in (str, int, float, bool, type(None)):
            preview = repr(value)[:160]
        elif type(value) in (list, tuple, dict, set, frozenset):
            preview = f'{len(value)} 個項目'
        else:
            preview = f'<{type(value).__name__}>'
        rows.append({'name': name, 'type': type(value).__name__, 'value': preview})
        if len(rows) >= 80:
            break
    return json.dumps(rows, ensure_ascii=False)


def _studio_complete(prefix):
    completer = rlcompleter.Completer(_namespace)
    options = []
    for index in range(60):
        option = completer.complete(prefix, index)
        if option is None:
            break
        if option not in options:
            options.append(option)
    return json.dumps(options, ensure_ascii=False)
