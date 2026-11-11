// A refusal meant for the person: the message is English text that the interface translates, with
// optional values for its {placeholders}. Anything else that is thrown is a bug.
export class DomainError extends Error {
  params: Record<string, string | number> | undefined;
  constructor(message: string, params?: Record<string, string | number>) {
    super(message);
    this.name = "DomainError";
    this.params = params;
  }
}
