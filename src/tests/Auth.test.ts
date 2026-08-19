import assert from "node:assert";
import { createHmac } from "node:crypto";
import { AssertSecret, CreateToken, GenerateSecret, MIN_SECRET_LENGTH, VerifyToken } from "../utils/jwt";
import { ParseDuration } from "../utils/duration";

const secret = GenerateSecret();
const foreign = GenerateSecret();

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (data: string) => createHmac("sha256", secret).update(data).digest("base64url");

function main(): void {
    const token = CreateToken(secret, "webpanel", ParseDuration("30d")!, ["gallery:read"]);
    const payload = VerifyToken(token, secret);

    assert.equal(payload?.sub, "webpanel");
    assert.deepEqual(payload?.scope, ["gallery:read"]);
    assert.ok(payload!.exp - payload!.iat === 30 * 86_400, "30d muessen 30 Tage Gueltigkeit ergeben");

    const [header, body, signature] = token.split(".");

    assert.equal(VerifyToken(token, foreign), null, "fremd signierte Tokens duerfen nicht durchkommen");
    assert.equal(VerifyToken(token, ""), null, "ohne Secret darf nichts gelten");
    assert.equal(VerifyToken(token, "x".repeat(MIN_SECRET_LENGTH - 1)), null, "zu kurzes Secret zaehlt nicht");

    const forged = encode({ sub: "admin", iat: 1, exp: 9_999_999_999 });
    assert.equal(VerifyToken(`${header}.${forged}.${signature}`, secret), null, "getauschte Nutzdaten muessen auffliegen");

    assert.equal(VerifyToken("kein.echtes.token", secret), null);
    assert.equal(VerifyToken("nurzweiteile.hier", secret), null);
    assert.equal(VerifyToken(`${header}.${body}.`, secret), null, "leere Signatur darf nie gelten");

    for (const algorithm of ["none", "RS256", "HS512"]) {
        const swapped = encode({ alg: algorithm, typ: "JWT" });
        const data = `${swapped}.${body}`;

        assert.equal(
            VerifyToken(`${data}.${sign(data)}`, secret),
            null,
            `alg "${algorithm}" muss abgelehnt werden, auch mit gueltiger Signatur`
        );
    }

    assert.equal(VerifyToken(CreateToken(secret, "kurz", 999), secret), null, "abgelaufene Tokens muessen raus");

    assert.throws(() => CreateToken("zu-kurz", "wer", 1000), /SERVER_JWT_SECRET/);
    assert.throws(() => CreateToken(secret, "   ", 1000), /Empfänger/);
    assert.throws(() => CreateToken(secret, "wer", 0), /größer als 0/);
    assert.throws(() => AssertSecret(undefined), /SERVER_JWT_SECRET/);
    assert.doesNotThrow(() => AssertSecret(secret));

    assert.equal(ParseDuration("30d"), 30 * 86_400_000);
    assert.equal(ParseDuration("90m"), 90 * 60_000);
    assert.equal(ParseDuration("0s"), null, "0 ist keine Gueltigkeit");
    assert.equal(ParseDuration("morgen"), null);
    assert.equal(ParseDuration(null), null);

    console.log("OK - Signatur, alg-Confusion, Ablauf, Manipulation und Dauer-Parser verhalten sich korrekt");
}

main();
