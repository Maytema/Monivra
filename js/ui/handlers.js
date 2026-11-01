/* Handlers that markup refers to by id (data-action, data-input); the ids are rebuilt on every render. */
let actions = {};
let inputs = {};
let counter = 0;

export const registerAction = (handler) => {
  const id = "a" + ++counter;
  actions[id] = handler;
  return id;
};

export const registerInput = (handler) => {
  const id = "i" + ++counter;
  inputs[id] = handler;
  return id;
};

export const hasAction = (id) => id in actions;
export const runAction = (id, ...args) => actions[id]?.(...args);
export const runInput = (id, value) => inputs[id]?.(value);

export function resetHandlers() {
  actions = {};
  inputs = {};
  counter = 0;
}

// Builds markup with a registry of its own, e.g. a preview of a screen that is not shown yet.
export function withTemporaryHandlers(build) {
  const saved = { actions, inputs, counter };
  resetHandlers();
  try {
    return build();
  } finally {
    ({ actions, inputs, counter } = saved);
  }
}
