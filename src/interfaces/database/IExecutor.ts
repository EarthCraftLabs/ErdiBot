import { ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type QueryParam = string | number | boolean | Date | Buffer | null;

export default interface IExecutor {
    Rows(sql: string, params?: QueryParam[]): Promise<RowDataPacket[]>;
    Run(sql: string, params?: QueryParam[]): Promise<ResultSetHeader>;
    Raw(sql: string): Promise<void>;
}
