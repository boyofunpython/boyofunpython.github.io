"""Convert CPython's own AST to editable Blockly state without executing code."""
import ast
import json
import io
import tokenize

_call_catalog = json.loads(globals().get('_studio_block_catalog', '[]'))


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

    def call(self, node, statement=False):
        function = self.segment(node.func)
        for spec in _call_catalog:
            if spec['result'] == statement:
                continue
            method = spec['name'].startswith('.')
            if method:
                if not isinstance(node.func, ast.Attribute) or '.' + node.func.attr != spec['name']:
                    continue
            elif function not in [spec['name']] + spec.get('aliases', []):
                continue
            args = spec['args']
            if len(node.args) > len(args) or any(isinstance(arg, ast.Starred) for arg in node.args):
                continue
            assigned = {arg['name']: value for arg, value in zip(args, node.args)}
            valid = True
            for keyword in node.keywords:
                target = next((arg for arg in args if (arg.get('keyword') or arg['name'].lower()) == keyword.arg), None)
                if target is None or target['name'] in assigned:
                    valid = False
                    break
                assigned[target['name']] = keyword.value
            if not valid or len(assigned) != len(args):
                continue
            inputs = {name: self.expression(value) for name, value in assigned.items()}
            if method:
                inputs['OBJECT'] = self.expression(node.func.value)
            return _block(spec['type'], inputs=inputs)
        return None

    def else_header(self, node):
        for line in range(node.body[-1].end_lineno + 1, node.orelse[0].lineno + 1):
            source = self.lines[line - 1]
            if len(source) - len(source.lstrip()) == node.col_offset and source.lstrip().startswith('else:'):
                return line
        return node.orelse[0].lineno

    def branch_header(self, node, keyword, start, stop):
        for line in range(start, stop + 1):
            source = self.lines[line - 1]
            if len(source) - len(source.lstrip()) == node.col_offset and source.lstrip().startswith(keyword + ':'):
                return line
        return stop

    def conditional(self, node):
        inputs = {}
        index = 0
        current = node
        while True:
            chained = len(current.orelse) == 1 and isinstance(current.orelse[0], ast.If) and current.orelse[0].col_offset == current.col_offset
            boundary = current.orelse[0].lineno if chained else self.else_header(current) if current.orelse else current.end_lineno + 1
            inputs['IF' + str(index)] = self.expression(current.test)
            inputs['DO' + str(index)] = self.suite(current.body, current.lineno + 1, boundary - 1)
            if chained:
                index += 1
                current = current.orelse[0]
            else:
                if current.orelse:
                    inputs['ELSE'] = self.suite(current.orelse, boundary + 1, current.end_lineno)
                return _block('controls_if', inputs=inputs, extra={'elseIfCount': index, 'hasElse': bool(current.orelse)})

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
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in ('set', 'tuple', 'dict', 'list') and not node.args and not node.keywords:
                kind = {'set': 'py_set', 'tuple': 'py_tuple', 'dict': 'py_dict', 'list': 'lists_create_with'}[node.func.id]
                return _block(kind, extra={'itemCount' if node.func.id == 'list' else 'count': 0})
            specialized = self.call(node)
            if specialized:
                return specialized
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
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)) and any(isinstance(item, ast.Starred) for item in node.elts):
            return _block('py_expression', {'CODE': self.segment(node)})
        if isinstance(node, (ast.List, ast.Tuple)) and len(node.elts) <= 32:
            if isinstance(node, ast.List):
                return _block('lists_create_with', inputs={f'ADD{i}': self.expression(value) for i, value in enumerate(node.elts)}, extra={'itemCount': len(node.elts)})
            return _block('py_tuple', inputs={f'ITEM{i}': self.expression(value) for i, value in enumerate(node.elts)}, extra={'count': len(node.elts)})
        if isinstance(node, ast.Set) and len(node.elts) <= 32:
            return _block('py_set', inputs={f'ITEM{i}': self.expression(value) for i, value in enumerate(node.elts)}, extra={'count': len(node.elts)})
        if isinstance(node, ast.Dict) and len(node.keys) <= 32 and all(key is not None for key in node.keys):
            return _block('py_dict', inputs={name: value for i, (key, value) in enumerate(zip(node.keys, node.values)) for name, value in [(f'KEY{i}', self.expression(key)), (f'VALUE{i}', self.expression(value))]}, extra={'count': len(node.keys)})
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)) and len(node.generators) == 1:
            generator = node.generators[0]
            if not generator.is_async and len(generator.ifs) <= 1:
                kind = {ast.ListComp: 'list', ast.SetComp: 'set', ast.DictComp: 'dict', ast.GeneratorExp: 'generator'}[type(node)]
                inputs = {'ITER': self.expression(generator.iter), 'VALUE': self.expression(node.value if isinstance(node, ast.DictComp) else node.elt)}
                if isinstance(node, ast.DictComp):
                    inputs['KEY'] = self.expression(node.key)
                if generator.ifs:
                    inputs['TEST'] = self.expression(generator.ifs[0])
                return _block('py_comprehension_' + kind, {'VAR': self.segment(generator.target)}, inputs)
        if isinstance(node, ast.Lambda):
            return _block('py_lambda', {'PARAMS': ast.unparse(node.args)}, {'VALUE': self.expression(node.body)})
        if isinstance(node, ast.IfExp):
            return _block('logic_ternary', inputs={'IF': self.expression(node.test), 'THEN': self.expression(node.body), 'ELSE': self.expression(node.orelse)})
        if isinstance(node, ast.UnaryOp):
            return _block('py_unary', {'OP': {ast.USub: '-', ast.UAdd: '+', ast.Invert: '~', ast.Not: 'not'}[type(node.op)]}, {'VALUE': self.expression(node.operand)})
        if isinstance(node, ast.Attribute):
            return _block('py_attribute', {'ATTR': node.attr}, {'OBJECT': self.expression(node.value)})
        if isinstance(node, ast.Subscript):
            inputs = {'OBJECT': self.expression(node.value)}
            if isinstance(node.slice, ast.Slice):
                for name, value in [('START', node.slice.lower), ('STOP', node.slice.upper), ('STEP', node.slice.step)]:
                    if value is not None:
                        inputs[name] = self.expression(value)
                return _block('py_slice', inputs=inputs)
            return _block('py_index', inputs={**inputs, 'INDEX': self.expression(node.slice)})
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
            if isinstance(node.value, ast.Call):
                specialized = self.call(node.value, statement=True)
                if specialized:
                    return specialized
            if isinstance(node.value, ast.Yield):
                return _block('py_yield', inputs={'VALUE': self.expression(node.value.value)} if node.value.value else None)
            return _block('py_expr_stmt', inputs={'VALUE': self.expression(node.value)})
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            return _block('py_assign', {'NAME': node.targets[0].id}, {'VALUE': self.expression(node.value)})
        if isinstance(node, ast.If):
            return self.conditional(node)
        if isinstance(node, ast.FunctionDef) and not node.decorator_list and not getattr(node, 'type_params', []):
            return _block('py_function', {'NAME': node.name, 'PARAMS': ast.unparse(node.args), 'RETURNS': self.segment(node.returns) if node.returns else ''}, {'BODY': self.suite(node.body, node.lineno + 1, node.end_lineno)})
        if isinstance(node, ast.ClassDef) and not node.decorator_list and not getattr(node, 'type_params', []):
            bases = [self.segment(base) for base in node.bases] + [(keyword.arg + '=' if keyword.arg else '**') + self.segment(keyword.value) for keyword in node.keywords]
            return _block('py_class', {'NAME': node.name, 'BASES': ', '.join(bases)}, {'BODY': self.suite(node.body, node.lineno + 1, node.end_lineno)})
        if isinstance(node, ast.Import) and len(node.names) == 1:
            return _block('py_import', {'MODULE': node.names[0].name, 'ALIAS': node.names[0].asname or ''})
        if isinstance(node, ast.ImportFrom):
            return _block('py_import_from', {'MODULE': '.' * node.level + (node.module or ''), 'NAMES': ', '.join(alias.name + (' as ' + alias.asname if alias.asname else '') for alias in node.names)})
        if isinstance(node, ast.With) and len(node.items) == 1:
            item = node.items[0]
            return _block('py_with', {'AS': self.segment(item.optional_vars) if item.optional_vars else ''}, {'CONTEXT': self.expression(item.context_expr), 'BODY': self.suite(node.body, node.lineno + 1, node.end_lineno)})
        if isinstance(node, ast.Try) and len(node.handlers) == 1:
            handler = node.handlers[0]
            else_line = self.branch_header(node, 'else', handler.end_lineno + 1, node.orelse[0].lineno) if node.orelse else None
            finally_line = self.branch_header(node, 'finally', handler.end_lineno + 1, node.finalbody[0].lineno) if node.finalbody else None
            handler_end = (else_line or finally_line or node.end_lineno + 1) - 1
            return _block('py_try', {'EXCEPTION': self.segment(handler.type) if handler.type else '', 'NAME': handler.name or ''}, {'BODY': self.suite(node.body, node.lineno + 1, handler.lineno - 1), 'HANDLER': self.suite(handler.body, handler.lineno + 1, handler_end), 'ELSE': self.suite(node.orelse, else_line + 1, (finally_line or node.end_lineno + 1) - 1) if else_line else None, 'FINALLY': self.suite(node.finalbody, finally_line + 1, node.end_lineno) if finally_line else None})
        if isinstance(node, ast.Raise) and node.cause is None:
            return _block('py_raise', inputs={'ERROR': self.expression(node.exc)} if node.exc else None)
        if isinstance(node, ast.Assert):
            return _block('py_assert', inputs={'TEST': self.expression(node.test), **({'MESSAGE': self.expression(node.msg)} if node.msg else {})})
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            return _block('py_annotation', {'NAME': node.target.id}, {'TYPE': self.expression(node.annotation), **({'VALUE': self.expression(node.value)} if node.value else {})})
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
