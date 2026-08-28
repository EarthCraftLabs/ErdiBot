export interface IOAuthUser {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
    email: string | null;
}

// Beitritt und Rolle werden getrennt gemeldet: wer schon auf dem Server war, bekommt
// joined: false und trotzdem seine Rolle.
export interface IOAuthLogin {
    user: IOAuthUser;
    token: string;
    joined: boolean;
    role: boolean;
}

export type OAuthResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export default interface IOAuthService {
    readonly Ready: boolean;
    readonly Hint: string;
    readonly RedirectURI: string;
    readonly Pending: number;

    Authorize(): string;
    Login(code: string, state: string): Promise<OAuthResult<IOAuthLogin>>;
}
