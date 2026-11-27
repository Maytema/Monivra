// Any module the screens import and the stand does not need: every name is a harmless function or component.
const make = () => new Proxy(function () { return make(); }, {
  get: (t, k) => (k === "__esModule" ? true : k === "then" ? undefined : k === Symbol.toPrimitive ? () => "" : make()),
  apply: () => make(),
  construct: () => make(),
});
module.exports = make();
