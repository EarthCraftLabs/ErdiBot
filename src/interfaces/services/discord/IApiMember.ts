export default interface IApiMember {
    id: string;
    username: string;
    displayName: string;
    nickname: string | null;
    avatar: string;
    joinedAt: string | null;
    roles: string[];
}
