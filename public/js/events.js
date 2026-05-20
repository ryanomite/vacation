// Simple pub/sub event bus — decouples modules without circular imports

const _handlers = new Map();

/** Subscribe to an event. Returns an unsubscribe function. */
export function on(event, fn) {
  if (!_handlers.has(event)) _handlers.set(event, []);
  _handlers.get(event).push(fn);
  return () => off(event, fn);
}

/** Unsubscribe a specific handler. */
export function off(event, fn) {
  const list = _handlers.get(event);
  if (list) _handlers.set(event, list.filter(f => f !== fn));
}

/** Emit an event, calling all subscribers synchronously. */
export function emit(event, data) {
  const list = _handlers.get(event);
  if (list) list.forEach(fn => fn(data));
}
