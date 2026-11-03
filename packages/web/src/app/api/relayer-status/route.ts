import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dispatchId = searchParams.get('dispatchId');

  const dbPath = process.env.RELAYER_SQLITE_PATH || '/tmp/synapse_relayer.db';

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({
      status: 'WAITING_FOR_DAEMON',
      message: 'Relayer database file not created yet',
      logs: [],
      latest: []
    });
  }

  try {
    const db = new Database(dbPath, { readonly: true });

    if (dispatchId) {
      const record = db.prepare('SELECT * FROM dispatches WHERE dispatch_id = ?').get(dispatchId);
      return NextResponse.json({ record });
    }

    const latest = db.prepare('SELECT * FROM dispatches ORDER BY id DESC LIMIT 10').all();
    const logs = db.prepare('SELECT * FROM relayer_logs ORDER BY id DESC LIMIT 30').all();

    return NextResponse.json({
      status: 'ACTIVE',
      latest,
      logs: logs.reverse(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}