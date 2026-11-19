import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseConstruct extends Construct {
  public readonly roomsTable: dynamodb.Table;
  public readonly schedulesTable: dynamodb.Table;
  public readonly bookingsTable: dynamodb.Table;
  public readonly slotLocksTable: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Table 1: ClassSpaceRooms
    this.roomsTable = new dynamodb.Table(this, 'ClassSpaceRoomsTable', {
      tableName: 'ClassSpaceRooms',
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.DEFAULT,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.roomsTable.addGlobalSecondaryIndex({
      indexName: 'GSI_BlockFloor',
      partitionKey: { name: 'blockId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'floorRoomKey', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table 2: ClassSpaceSchedules
    // Time-first sort key: <startTime>#TT#<scheduleId> and <startTime>#RES#<restrictionId>
    this.schedulesTable = new dynamodb.Table(this, 'ClassSpaceSchedulesTable', {
      tableName: 'ClassSpaceSchedules',
      partitionKey: { name: 'roomDateKey', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'scheduleKey', type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.DEFAULT,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Table 3: ClassSpaceBookings
    this.bookingsTable = new dynamodb.Table(this, 'ClassSpaceBookingsTable', {
      tableName: 'ClassSpaceBookings',
      partitionKey: { name: 'bookingId', type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.DEFAULT,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'GSI_StudentBookings',
      partitionKey: { name: 'studentId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.bookingsTable.addGlobalSecondaryIndex({
      indexName: 'GSI_RoomDateBookings',
      partitionKey: { name: 'roomDateKey', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'statusStartKey', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table 4: ClassSpaceSlotLocks
    // Lock key format: roomId#date#slotStartHHmm (15-minute intervals)
    // TTL is intentionally disabled until runtime logic formally proves historical locks
    // cannot expire before their scheduled Asia/Kolkata end time.
    this.slotLocksTable = new dynamodb.Table(this, 'ClassSpaceSlotLocksTable', {
      tableName: 'ClassSpaceSlotLocks',
      partitionKey: { name: 'lockKey', type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.DEFAULT,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
