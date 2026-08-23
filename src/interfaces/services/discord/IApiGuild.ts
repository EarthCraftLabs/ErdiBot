import IApiRole from "./IApiRole";

export default interface IApiGuild {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
    roles: IApiRole[];
}
