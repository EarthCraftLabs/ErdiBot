import assert from "node:assert";
import DiscordService from "../services/DiscordService";

const GUILD = "1162553851187040326";
const USER = "1059621019947634739";
const ROLE = "1162597983305609216";
const HIGH_ROLE = "1215295182619021332";
const MANAGED_ROLE = "1209145843974672384";

interface IProbe {
    service: DiscordService;
    added: string[];
    removed: string[];
}

interface IProbeOptions {
    manageRoles?: boolean;
    hasRole?: boolean;
    botRank?: number;
    throwOnWrite?: boolean;
    withBot?: boolean;
}

function Probe(options: IProbeOptions = {}): IProbe {
    const { manageRoles = true, hasRole = false, botRank = 10, throwOnWrite = false, withBot = true } = options;

    const added: string[] = [];
    const removed: string[] = [];

    const roles = new Map<string, unknown>([
        [GUILD, { id: GUILD, name: "@everyone", color: 0, position: 0, managed: false }],
        [ROLE, { id: ROLE, name: "Team", color: 0, position: 5, managed: false }],
        [HIGH_ROLE, { id: HIGH_ROLE, name: "Admin", color: 0, position: 50, managed: false }],
        [MANAGED_ROLE, { id: MANAGED_ROLE, name: "Booster", color: 0, position: 2, managed: true }],
    ]);

    const member = {
        id: USER,
        user: { username: "mecrytv" },
        displayName: "MecryTv",
        nickname: null,
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        displayAvatarURL: () => "https://cdn.discordapp.com/avatar.png",
        guild: { id: GUILD },
        roles: {
            cache: {
                has: (id: string) => hasRole && id === ROLE,
                keys: () => (hasRole ? [ROLE, GUILD] : [GUILD])[Symbol.iterator](),
            },
            async add(role: { id: string }) {
                if (throwOnWrite) throw new Error("Missing Permissions");
                added.push(role.id);
            },
            async remove(role: { id: string }) {
                if (throwOnWrite) throw new Error("Missing Permissions");
                removed.push(role.id);
            },
        },
    };

    const guild = {
        id: GUILD,
        name: "Ascension",
        memberCount: 3,
        iconURL: () => null,
        roles: { cache: roles },
        members: {
            me: withBot
                ? {
                      permissions: { has: () => manageRoles },
                      roles: {
                          highest: { comparePositionTo: (role: { position: number }) => botRank - role.position },
                      },
                  }
                : null,
            cache: new Map([[USER, member]]),
            async fetch() {
                return member;
            },
        },
    };

    const client = {
        guilds: {
            cache: new Map([[GUILD, guild]]),
            async fetch() {
                return guild;
            },
        },
    };

    return { service: new DiscordService(client as never), added, removed };
}

async function main(): Promise<void> {
    {
        const { service, added } = Probe();
        const result = await service.GrantRole(GUILD, USER, ROLE);

        assert.deepEqual(result, { ok: true, changed: true });
        assert.deepEqual(added, [ROLE], "die Rolle muss wirklich vergeben worden sein");
    }

    {
        const { service, added } = Probe({ hasRole: true });
        const result = await service.GrantRole(GUILD, USER, ROLE);

        assert.deepEqual(result, { ok: true, changed: false }, "vorhandene Rolle darf kein Schreiben ausloesen");
        assert.deepEqual(added, []);
    }

    {
        const { service, removed } = Probe({ hasRole: true });

        assert.deepEqual(await service.RevokeRole(GUILD, USER, ROLE), { ok: true, changed: true });
        assert.deepEqual(removed, [ROLE]);
    }

    {
        const { service, removed } = Probe({ hasRole: false });

        assert.deepEqual(await service.RevokeRole(GUILD, USER, ROLE), { ok: true, changed: false });
        assert.deepEqual(removed, []);
    }

    const blocked: Array<[string, IProbeOptions, string, RegExp]> = [
        ["@everyone", {}, GUILD, /everyone/i],
        ["Integrations-Rolle", {}, MANAGED_ROLE, /Integration/i],
        ["Rolle ueber dem Bot", {}, HIGH_ROLE, /höchsten Rolle/i],
        ["ohne ManageRoles", { manageRoles: false }, ROLE, /Berechtigung/i],
        ["Bot nicht im Server", { withBot: false }, ROLE, /nicht auf diesem Server/i],
    ];

    for (const [label, options, roleId, pattern] of blocked) {
        const { service, added } = Probe(options);
        const result = await service.GrantRole(GUILD, USER, roleId);

        assert.equal(result.ok, false, `${label} muss abgelehnt werden`);
        assert.equal(result.ok === false && result.status, 403, `${label} muss 403 liefern`);
        assert.match(result.ok === false ? result.error : "", pattern, `${label}: Meldung passt nicht`);
        assert.deepEqual(added, [], `${label} darf nichts schreiben`);
    }

    {
        const { service } = Probe();

        assert.deepEqual(await service.GrantRole("999", USER, ROLE), {
            ok: false,
            status: 404,
            error: "Unbekannter Server",
        });

        assert.deepEqual(await service.GrantRole(GUILD, "keine-id", ROLE), {
            ok: false,
            status: 404,
            error: "Unbekanntes Mitglied",
        });

        assert.deepEqual(await service.GrantRole(GUILD, USER, "999"), {
            ok: false,
            status: 404,
            error: "Unbekannte Rolle",
        });
    }

    {
        const { service } = Probe({ throwOnWrite: true });
        const result = await service.GrantRole(GUILD, USER, ROLE);

        assert.equal(result.ok, false);
        assert.equal(result.ok === false && result.status, 502, "ein Fehler von Discord muss 502 werden, nicht 500");
    }

    {
        const { service } = Probe();

        assert.equal(service.Size, 0);
        await service.Member(GUILD, USER);
        assert.equal(service.Size, 1, "ein geladenes Mitglied muss im Cache landen");

        await service.Member(GUILD, USER);
        assert.equal(service.Size, 1);

        service.Invalidate(GUILD, USER);
        assert.equal(service.Size, 0, "Invalidate muss den Eintrag entfernen");

        await service.Member(GUILD, USER);
        service.Invalidate(GUILD);
        assert.equal(service.Size, 0, "Invalidate ohne User muss den ganzen Server leeren");

        await service.Member(GUILD, USER);
        service.Invalidate();
        assert.equal(service.Size, 0, "Invalidate ohne Argumente muss alles leeren");
    }

    {
        const { service } = Probe();
        const guild = await service.Guild(GUILD);
        const member = await service.Member(GUILD, USER);

        const api = service.ToGuild(guild!);
        assert.equal(api.name, "Ascension");
        assert.deepEqual(
            api.roles.map((role) => role.id),
            [HIGH_ROLE, ROLE, MANAGED_ROLE, GUILD],
            "Rollen absteigend nach Position sortiert"
        );

        assert.equal(api.roles.find((role) => role.id === ROLE)?.assignable, true);
        assert.equal(api.roles.find((role) => role.id === MANAGED_ROLE)?.assignable, false, "Integrations-Rolle");
        assert.equal(api.roles.find((role) => role.id === HIGH_ROLE)?.assignable, false, "steht über dem Bot");
        assert.equal(api.roles.find((role) => role.id === GUILD)?.assignable, false, "@everyone");

        const shape = service.ToMember(member!);
        assert.equal(shape.username, "mecrytv");
        assert.deepEqual(shape.roles, [], "die @everyone-Rolle gehoert nicht in die Liste");
        assert.equal(shape.joinedAt, "2026-01-01T00:00:00.000Z");
    }

    console.log("OK - Rollen vergeben, Hierarchie, Berechtigungen, Fehler von Discord, Cache und Abbildung geprueft");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
