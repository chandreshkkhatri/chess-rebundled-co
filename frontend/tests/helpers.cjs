const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(path, dependencies = {}, globals = {}, transform = source => source) {
  const source = transform(readFileSync(resolve(__dirname, '..', path), 'utf8'));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, console, AbortController, DOMException, setTimeout, clearTimeout, process: { env: {} }, ...globals,
    require: id => {
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  return exports;
}

// Exercise the real component's handlers/effects without replacing game logic.
function hookHarness() {
  const slots = [];
  let index = 0, pending = [], dirty = false, component, tree;
  const changed = (previous, deps) => !previous || !deps || deps.some((value, i) => !Object.is(value, previous[i]));
  const memo = (make, deps) => {
    const i = index++;
    if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: make() };
    return slots[i].value;
  };
  const react = {
    useState(initial) {
      const i = index++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, update => {
        const value = typeof update === 'function' ? update(slots[i].value) : update;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef: initial => memo(() => ({ current: initial }), []),
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect(callback, deps) {
      const i = index++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = callback(); });
      }
    },
  };
  return {
    react,
    render(next = component) {
      component = next;
      for (let attempts = 0; attempts < 30; attempts++) {
        dirty = false; index = 0; pending = [];
        tree = component(); pending.forEach(effect => effect());
        if (!dirty) return tree;
      }
      throw new Error('Component did not settle');
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function find(tree, type) {
  if (!tree || typeof tree !== 'object') return;
  if (tree.type === type) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const match = find(child, type);
    if (match) return match;
  }
}

module.exports = { loadSource, hookHarness, jsx, find };
