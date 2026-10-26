"""Convert CPython's own AST to editable Blockly state without executing code."""
import ast
import json
import io
import tokenize


def _block(kind, fields=None, inputs=None, extra=None):
    result = {'type': kind}
    if fields:
        result['fields'] = fields
    if inputs:
        result['inputs'] = {name: {'block': value} for name, value in inputs.items() if value}
    if extra is not None:
        result['extraState'] = extra
    return result


class Converter:
    def __init__(self, source):
        self.source = source
        self.lines = source.splitlines()
        self.inline_comments = {
            token.start[0] for token in tokenize.generate_tokens(io.StringIO(source).readline)
            if token.type == tokenize.COMMENT and self.lines[token.start[0] - 1][:token.start[1]].strip()
        }

    def segment(self, node):
        return ast.get_source_segment(self.source, node) or ast.unparse(node)

    def raw_statement(self, node):
        start = min([node.lineno] + [d.lineno for d in getattr(node, 'decorator_list', [])])
        lines = self.lines[start - 1:node.end_lineno]
        return '\n'.join(line[node.col_offset:] for line in lines)

    def expression(self, node):
        if isinstance(node, ast.Constant):
            if isinstance(node.value, str):
                return _block('text', {'TEXT': node.value})
            if node.value is None or isinstance(node.value, bool):
                return _block('py_literal', {'VALUE': repr(node.value)})
            if isinstance(node.value, (int, float)) and not isinstance(node.value, complex):
                return _block('py_number', {'NUM': self.segment(node)})
        if isinstance(node, ast.Name):
            return _block('py_name', {'NAME': node.id})
        if isinstance(node, ast.Call) and len(node.args) + len(node.keywords) <= 32:
            values = [self.expression(arg.value if isinstance(arg, ast.Starred) else arg) for arg in node.args]
            keywords = ['*' if isinstance(arg, ast.Starred) else '' for arg in node.args]
            for keyword in node.keywords:
                values.append(self.expression(keyword.value))
                keywords.append((keyword.arg + '=') if keyword.arg else '**')
            function = self.segment(node.func)
            if not isinstance(node.func, (ast.Name, ast.Attribute)):
                function = f'({function})'
            return _block('py_call', {'FUNC': function}, {f'ARG{i}': value for i, value in enumerate(values)}, {'count': len(values), 'keywords': keywords})
        if isinstance(node, (ast.List, ast.Tuple)) and len(node.elts) <= 32:
            if isinstance(node, ast.List):
                return _block('lists_create_with', inputs={f'ADD{i}': self.expression(value) for i, value in enumerate(node.elts)}, extra={'itemCount': len(node.elts)})
        binary = {ast.Add: '+', ast.Sub: '-', ast.Mult: '*', ast.Div: '/', ast.FloorDiv: '//', ast.Mod: '%', ast.Pow: '**', ast.BitAnd: '&', ast.BitOr: '|', ast.BitXor: '^', ast.LShift: '<<', ast.RShift: '>>'}
        if isinstance(node, ast.BinOp) and type(node.op) in binary:
            return _block('py_binary', {'OP': binary[type(node.op)]}, {'LEFT': self.expression(node.left), 'RIGHT': self.expression(node.right)})
        comparisons = {ast.Eq: '==', ast.NotEq: '!=', ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>', ast.GtE: '>=', ast.Is: 'is', ast.IsNot: 'is not', ast.In: 'in', ast.NotIn: 'not in'}
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            return _block('py_binary', {'OP': comparisons[type(node.ops[0])]}, {'LEFT': self.expression(node.left), 'RIGHT': self.expression(node.comparators[0])})
        if isinstance(node, ast.BoolOp):
            value = self.expression(node.values[0])
            for item in node.values[1:]:
                value = _block('py_binary', {'OP': 'and' if isinstance(node.op, ast.And) else 'or'}, {'LEFT': value, 'RIGHT': self.expression(item)})
            return value
        return _block('py_expression', {'CODE': self.segment(node)})

    def statement(self, node):
        # Keep annotated statements intact rather than losing inline teaching
        # notes when Blockly regenerates the program.
        if any(line in self.inline_comments for line in range(node.lineno, node.end_lineno + 1)):
            return _block('py_statement', {'CODE': self.raw_statement(node)})
        if isinstance(node, ast.Expr):
            return _block('py_expr_stmt', inputs={'VALUE': self.expression(node.value)})
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            return _block('py_assign', {'NAME': node.targets[0].id}, {'VALUE': self.expression(node.value)})
        if isinstance(node, ast.If):
            then_end = node.orelse[0].lineno - 1 if node.orelse else node.end_lineno
            return _block('py_if', inputs={'TEST': self.expression(node.test), 'THEN': self.suite(node.body, node.lineno + 1, then_end), 'ELSE': self.suite(node.orelse, then_end, node.end_lineno)})
        if isinstance(node, ast.For) and isinstance(node.target, ast.Name) and not node.orelse:
            return _block('py_for', {'NAME': node.target.id}, {'ITER': self.expression(node.iter), 'BODY': self.suite(node.body, node.lineno + 1, node.end_lineno)})
        if isinstance(node, ast.While) and not node.orelse:
            return _block('py_while', inputs={'TEST': self.expression(node.test), 'BODY': self.suite(node.body, node.lineno + 1, node.end_lineno)})
        if isinstance(node, ast.Return) and node.value:
            return _block('py_return', inputs={'VALUE': self.expression(node.value)})
        if isinstance(node, (ast.Pass, ast.Break, ast.Continue)) or isinstance(node, ast.Return) and node.value is None:
            return _block('py_keyword', {'KEYWORD': self.segment(node)})
        # Advanced Python remains lossless and editable instead of disappearing.
        return _block('py_statement', {'CODE': self.raw_statement(node)})

    def suite(self, nodes, start, end):
        blocks = []
        cursor = start
        for node in nodes:
            first_line = min([node.lineno] + [d.lineno for d in getattr(node, 'decorator_list', [])])
            for line in self.lines[max(0, cursor - 1):first_line - 1]:
                if line.lstrip().startswith('#'):
                    blocks.append(_block('py_comment', {'TEXT': line.lstrip()[1:]}))
            blocks.append(self.statement(node))
            cursor = node.end_lineno + 1
        for line in self.lines[max(0, cursor - 1):end]:
            if line.lstrip().startswith('#'):
                blocks.append(_block('py_comment', {'TEXT': line.lstrip()[1:]}))
        for index in range(len(blocks) - 1):
            blocks[index]['next'] = {'block': blocks[index + 1]}
        return blocks[0] if blocks else None


def parse_blocks(source):
    try:
        tree = ast.parse(source)
        block = Converter(source).suite(tree.body, 1, len(source.splitlines()))
        return json.dumps({'state': {'blocks': {'languageVersion': 0, 'blocks': [dict(block, x=24, y=24)] if block else []}}}, ensure_ascii=False)
    except SyntaxError as error:
        return json.dumps({'error': f'第 {error.lineno} 行：{error.msg}', 'line': error.lineno}, ensure_ascii=False)
