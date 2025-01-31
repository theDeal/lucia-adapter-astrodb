import { sql } from "@astrojs/db/runtime";

import type { SqliteDB, Table } from "@astrojs/db/runtime";
import type { Adapter, DatabaseSession, DatabaseUser, UserId } from "lucia";

export class AstroDBAdapter implements Adapter {
	private db: SqliteDB;

	private sessionTable: SessionTable;
	private userTable: UserTable;

	constructor(db: SqliteDB, sessionTable: SessionTable, userTable: UserTable) {
		this.db = db;
		this.sessionTable = sessionTable;
		this.userTable = userTable;
	}

	public async deleteSession(sessionId: string): Promise<void> {
		await this.db.delete(this.sessionTable).where(sql`${this.sessionTable.id} = ${sessionId}`);
	}

	public async deleteUserSessions(userId: UserId): Promise<void> {
		await this.db.delete(this.sessionTable).where(sql`${this.sessionTable.userId} = ${userId}`);
	}

	public async getSessionAndUser(
		sessionId: string
	): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {
		const result = await this.db
			.select({
				user: this.userTable,
				session: this.sessionTable
			})
			.from(this.sessionTable)
			.innerJoin(this.userTable, sql`${this.sessionTable.userId} = ${this.userTable.id}`)
			.where(sql`${this.sessionTable.id} = ${sessionId}`)
			.get();
		if (!result) return [null, null];
		return [transformIntoDatabaseSession(result.session), transformIntoDatabaseUser(result.user)];
	}

	public async getUserSessions(userId: UserId): Promise<DatabaseSession[]> {
		const result = await this.db
			.select()
			.from(this.sessionTable)
			.where(sql`${this.sessionTable.userId} = ${userId}`)
			.all();
		return result.map((val) => {
			return transformIntoDatabaseSession(val);
		});
	}

	public async setSession(session: DatabaseSession): Promise<void> {
		await this.db
			.insert(this.sessionTable)
			.values({
				id: session.id,
				userId: session.userId,
				expiresAt: session.expiresAt,
				...session.attributes
			})
			.run();
	}

	public async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
		await this.db
			.update(this.sessionTable)
			.set({
				expiresAt: expiresAt
			})
			.where(sql`${this.sessionTable.id} = ${sessionId}`)
			.run();
	}

	public async deleteExpiredSessions(): Promise<void> {
		await this.db
			.delete(this.sessionTable)
			.where(sql`${this.sessionTable.expiresAt} <= ${new Date().toISOString()}`);
	}
}

function transformIntoDatabaseSession(raw: any): DatabaseSession {
	const { id, userId, expiresAt, ...attributes } = raw;
	return {
		userId,
		id,
		expiresAt,
		attributes
	};
}

function transformIntoDatabaseUser(raw: any): DatabaseUser {
	const { id, ...attributes } = raw;
	return {
		id,
		attributes
	};
}

export type UserTable = Table<
	any,
	{
		id: {
			type: UserIdColumnType;
			schema: {
				unique: false;
				deprecated: any;
				name: any;
				collection: any;
				primaryKey: true;
			};
		};
	}
>;

export type SessionTable = Table<
	any,
	{
		id: {
			type: "text";
			schema: {
				unique: false;
				deprecated: any;
				name: any;
				collection: any;
				primaryKey: true;
			};
		};
		expiresAt: {
			type: "date";
			schema: {
				optional: false;
				unique: false;
				deprecated: any;
				name: any;
				collection: any;
			};
		};
		userId: {
			type: UserIdColumnType;
			schema: {
				unique: false;
				deprecated: false;
				name: any;
				collection: any;
				primaryKey: false;
				optional: false;
				references: {
					type: UserIdColumnType;
					schema: {
						unique: false;
						deprecated: false;
						name: any;
						collection: any;
						primaryKey: true;
					};
				};
			};
		};
	}
>;

type UserIdColumnType = UserId extends string ? "text" : UserId extends number ? "number" : never;
