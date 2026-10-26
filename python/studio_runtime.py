"""Browser output adapters for the bundled Python and turtle distributions."""
import sys
import builtins
import myturtle
import importlib
_svg = importlib.import_module('myturtle.svg')
from js import studioWrite, document

sys.modules['turtle'] = myturtle


# The original SVG factory lowercases every attribute. SVG and SMIL use
# case-sensitive viewBox, attributeName, attributeType and preserveAspectRatio.
# Preserve their spelling before serialization, rather than repairing markup.
def _studio_svg_tag(tag):
    def create(*args, **kwargs):
        node = document.createElementNS(_svg._svg_ns, tag)
        if tag == 'svg':
            node.setAttribute('xmlns', _svg._svg_ns)
        for arg in args:
            if isinstance(arg, (str, int, float)):
                arg = document.createTextNode(str(arg))
            node.appendChild(arg)
        for key, value in kwargs.items():
            if key.startswith('on'):
                node.addEventListener(key[2:], value)
            elif key == 'style':
                node.setAttribute('style', ';'.join(f'{k}: {v}' for k, v in value.items()))
            elif 'href' in key:
                node.setAttributeNS(_svg._xlink_ns, 'href', value)
            elif value is not False:
                attribute = key.lower() if key in ('Id', 'From') else key.replace('_', '-')
                node.setAttributeNS(None, attribute, value)
        return node
    return create


for _tag in _svg._svg_tags:
    setattr(_svg, _tag, _studio_svg_tag(_tag))


def _studio_done():
    # done() is often followed by another statement; don't rely on the final
    # Python expression's return value to display the scene.
    document.getElementById('result').innerHTML = myturtle.Screen().show_scene()


myturtle.done = myturtle.mainloop = myturtle.show_scene = _studio_done


class StudioOutput:
    def write(self, value):
        studioWrite(value)
        return len(value)

    def flush(self):
        pass


sys.stdout = sys.stderr = StudioOutput()


def studio_input(prompt=''):
    raise RuntimeError('這個練習室不支援 input() 互動輸入，請使用「虛擬機器」執行。')


builtins.input = studio_input


def _studio_tracer(self, n=None, delay=None):
    if n is None:
        return int(self._animate)
    self.animation('off' if n == 0 else 'on')


# The bundled turtle left tracer() as an unimplemented warning. Support the
# common static/animated switch for both turtle.tracer() and Screen.tracer().
myturtle.Screen.tracer = _studio_tracer
_original_restart = myturtle.restart


def _studio_restart():
    myturtle.Screen().animation('on')
    _original_restart()


myturtle.restart = _studio_restart
