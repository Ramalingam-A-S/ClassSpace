import {
  createDynamoDbRepositoryContext,
  createLazyDynamoDbDocumentClient,
} from '../repositories/dynamodb/repository-context';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';

let cachedContext: RepositoryContext | null = null;

function requireTableEnv(primaryName: string, fallbackName: string): string {
  const value = process.env[primaryName]?.trim() || process.env[fallbackName]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${primaryName}`);
  }
  return value;
}

export function getCampusTimezone(): string {
  return process.env.CAMPUS_TIMEZONE?.trim() || 'Asia/Kolkata';
}

export function getTodayCampusDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getCampusTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Returns a lazily initialized DynamoDB RepositoryContext for Lambda runtime.
 * Never invoked at module load time so unit tests without AWS credentials never fail.
 */
export function getRuntimeRepositoryContext(): RepositoryContext {
  if (cachedContext) {
    return cachedContext;
  }

  const region = process.env.AWS_REGION?.trim() || 'ap-south-1';
  const client = createLazyDynamoDbDocumentClient(region);

  cachedContext = createDynamoDbRepositoryContext({
    client,
    tables: {
      roomsTable: requireTableEnv('ROOMS_TABLE_NAME', 'ROOMS_TABLE'),
      schedulesTable: requireTableEnv('SCHEDULES_TABLE_NAME', 'SCHEDULES_TABLE'),
      bookingsTable: requireTableEnv('BOOKINGS_TABLE_NAME', 'BOOKINGS_TABLE'),
      slotLocksTable: requireTableEnv('SLOT_LOCKS_TABLE_NAME', 'SLOT_LOCKS_TABLE'),
    },
  });

  return cachedContext;
}
