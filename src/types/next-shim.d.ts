// Shim types for Next.js server helpers when using Supabase SSR in hybrid environments
declare module 'next/headers' {
  export interface RequestCookie {
    name: string;
    value: string;
  }
  export interface ResponseCookie extends RequestCookie {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date | number;
    sameSite?: true | false | 'lax' | 'strict' | 'none';
    httpOnly?: boolean;
    secure?: boolean;
    partitioned?: boolean;
  }
  export interface ReadonlyRequestCookies {
    get(name: string): RequestCookie | undefined;
    getAll(): RequestCookie[];
    has(name: string): boolean;
    set(name: string, value: string, options?: Partial<ResponseCookie>): void;
    delete(name: string): void;
  }
  export function cookies(): Promise<ReadonlyRequestCookies>;
}

declare module 'next/server' {
  export class NextRequest extends Request {
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string): void;
      delete(name: string): void;
    };
    headers: Headers;
  }
  export class NextResponse extends Response {
    static next(init?: { request?: { headers?: Headers } }): NextResponse;
    cookies: {
      set(name: string, value: string, options?: any): void;
      get(name: string): { name: string; value: string } | undefined;
    };
  }
}
