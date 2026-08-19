import { Collection } from "discord.js";
import Runnable from "../../../structures/Runnable";
import IRunnable from "./IRunnable";

export default interface IRunnableService {
    runnables: Collection<string, Runnable>;

    Initialize(): Promise<void>;
    Stop(): void;

    ProcessDueTasks(): Promise<void>;
    RunNow(name: string): Promise<boolean>;
    CalculateNextRun(runnable: IRunnable, from?: Date): Date | null;
}
