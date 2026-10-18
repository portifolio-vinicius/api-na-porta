export interface SuccessResponse<T> {
  readonly code: string;
  readonly message: string;
  readonly data: T;
  readonly requestId: string;
}

export interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly string[];
    readonly requestId: string;
  };
}

const errors: Readonly<Record<number, readonly [string, string]>> = {
  400: ['VALIDATION_ERROR', 'Dados inválidos'],
  401: ['AUTHENTICATION_ERROR', 'Não autenticado'],
  403: ['FORBIDDEN', 'Acesso negado'],
  404: ['NOT_FOUND', 'Recurso não encontrado'],
  409: ['CONFLICT', 'Conflito de dados'],
  413: ['PAYLOAD_TOO_LARGE', 'Corpo da requisição excede o limite'],
  429: ['RATE_LIMITED', 'Muitas solicitações'],
};

/** Única fábrica dos envelopes públicos; nunca recebe a exceção original. */
export class Messages {
  static success<T>(data: T, status: number, requestId: string): SuccessResponse<T> {
    return {
      code: status === 201 ? 'CREATED' : 'SUCCESS',
      message: status === 201 ? 'Recurso criado com sucesso' : 'Operação realizada com sucesso',
      data,
      requestId,
    };
  }

  static validation(requestId: string, details: readonly string[] = [], message = 'Dados inválidos'): ErrorResponse {
    return { error: { code: 'VALIDATION_ERROR', message, details, requestId } };
  }

  static error(status: number, requestId: string, message?: string, details: readonly string[] = []): ErrorResponse {
    if (status === 400) return Messages.validation(requestId, details, message);
    const [code, defaultMessage] = errors[status] ?? (status >= 500
      ? ['INTERNAL_ERROR', 'Erro interno'] : ['HTTP_ERROR', 'Falha na requisição']);
    return { error: {
      code,
      message: status >= 500 ? defaultMessage : message ?? defaultMessage,
      details: status >= 500 ? [] : details,
      requestId,
    } };
  }
}
