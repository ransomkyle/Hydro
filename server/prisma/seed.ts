import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generatePortalCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function main() {
  console.log('Starting database seeding...');

  // Delete existing data to prevent duplications if run multiple times
  await prisma.jobPartUsed.deleteMany({});
  await prisma.stockLevel.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.quote.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.part.deleteMany({});
  await prisma.property.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  console.log('Cleared existing data.');

  // 1. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'GreenWay Irrigation',
      subscriptionTier: 'Pro',
    },
  });
  console.log(`Created Organization: ${org.name} (${org.id})`);

  // 2. Create Users
  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'admin@greenway.com',
      passwordHash: '$2b$10$DEMOPASSWORDHASH', // Simple mock hash
      firstName: 'Alice',
      lastName: 'Manager',
      role: 'admin',
      phone: '555-0100',
    },
  });

  const dispatcher = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'dispatcher@greenway.com',
      passwordHash: '$2b$10$DEMOPASSWORDHASH',
      firstName: 'Bob',
      lastName: 'Scheduler',
      role: 'dispatcher',
      phone: '555-0101',
    },
  });

  const tech = await prisma.user.create({
    data: {
      orgId: org.id,
      email: 'tech@greenway.com',
      passwordHash: '$2b$10$DEMOPASSWORDHASH',
      firstName: 'Charlie',
      lastName: 'Technician',
      role: 'technician',
      phone: '555-0102',
    },
  });
  console.log('Created admin, dispatcher, and technician users.');

  // 3. Create Warehouses
  const mainWarehouse = await prisma.warehouse.create({
    data: {
      orgId: org.id,
      name: 'Main Seattle Warehouse',
      isMobile: false,
    },
  });

  const truck1 = await prisma.warehouse.create({
    data: {
      orgId: org.id,
      name: 'Truck 1 (Charlie)',
      isMobile: true,
      assignedUserId: tech.id,
    },
  });
  console.log('Created warehouses.');

  // 4. Create Parts
  const partsData = [
    {
      sku: 'HUNTER-PGP-04',
      name: 'Hunter PGP Ultra Rotor Head 4"',
      description: '4-inch pop-up rotor sprinkler head with blue nozzle rack',
      category: 'sprinkler head',
      unitPrice: 14.99,
      costPrice: 7.50,
    },
    {
      sku: 'RAINBIRD-1804',
      name: 'Rain Bird 1804 Pop-Up Spray Head',
      description: '4-inch spray head with 15-foot half-circle nozzle',
      category: 'sprinkler head',
      unitPrice: 5.49,
      costPrice: 2.20,
    },
    {
      sku: 'POLY-PIPE-100',
      name: '1" Polyethylene Pipe (100ft Roll)',
      description: '100-foot roll of 1-inch flexible poly pipe (100 PSI)',
      category: 'pipe',
      unitPrice: 42.00,
      costPrice: 18.00,
    },
    {
      sku: 'ORBIT-VALVE-1',
      name: 'Orbit 1" Inline Sprinkler Valve',
      description: '1-inch automatic inline valve with solenoid, 24V AC',
      category: 'valve',
      unitPrice: 18.99,
      costPrice: 9.10,
    },
    {
      sku: 'WIFI-CONTROLLER-8',
      name: 'Rachio 3 Smart 8-Zone Controller',
      description: '8-zone Wi-Fi enabled smart controller with weather intelligence',
      category: 'controller',
      unitPrice: 199.00,
      costPrice: 110.00,
    },
  ];

  const parts = [];
  for (const partInfo of partsData) {
    const createdPart = await prisma.part.create({
      data: {
        orgId: org.id,
        ...partInfo,
      },
    });
    parts.push(createdPart);

    // Populate stock levels
    await prisma.stockLevel.create({
      data: {
        partId: createdPart.id,
        warehouseId: mainWarehouse.id,
        quantity: 150,
        minAlertThreshold: 20,
      },
    });

    await prisma.stockLevel.create({
      data: {
        partId: createdPart.id,
        warehouseId: truck1.id,
        quantity: 15,
        minAlertThreshold: 5,
      },
    });
  }
  console.log('Created parts, and populated stock levels for all warehouses.');

  // 5. Create Customers & Properties
  const customer1 = await prisma.customer.create({
    data: {
      orgId: org.id,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@gmail.com',
      phone: '206-555-1234',
      portalCode: generatePortalCode(),
      notes: 'Loves his lawn green. Keep dog gate closed.',
    },
  });

  const prop1 = await prisma.property.create({
    data: {
      orgId: org.id,
      customerId: customer1.id,
      streetAddress: '123 Maple St',
      city: 'Seattle',
      state: 'WA',
      zipCode: '98101',
      latitude: 47.6062,
      longitude: -122.3321,
      irrigationZonesCount: 4,
      waterShutoffLocation: 'Southwest side corner of the house, inside a black box in the bushes.',
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      orgId: org.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@yahoo.com',
      phone: '206-555-5678',
      portalCode: generatePortalCode(),
      notes: 'New build landscape installation.',
    },
  });

  const prop2 = await prisma.property.create({
    data: {
      orgId: org.id,
      customerId: customer2.id,
      streetAddress: '456 Oak Ave',
      city: 'Seattle',
      state: 'WA',
      zipCode: '98102',
      latitude: 47.6153,
      longitude: -122.3215,
      irrigationZonesCount: 8,
      waterShutoffLocation: 'In basement utility room next to water meter.',
    },
  });
  console.log('Created customers and corresponding properties.');
  console.log(`  Customer 1 (${customer1.email}) portal code: ${customer1.portalCode}`);
  console.log(`  Customer 2 (${customer2.email}) portal code: ${customer2.portalCode}`);

  // 6. Create Jobs
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const tomorrowAfternoon = new Date();
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
  tomorrowAfternoon.setHours(13, 0, 0, 0);

  const endMorning = new Date(tomorrow);
  endMorning.setHours(11, 30, 0, 0);

  const endAfternoon = new Date(tomorrowAfternoon);
  endAfternoon.setHours(15, 30, 0, 0);

  const job1 = await prisma.job.create({
    data: {
      orgId: org.id,
      propertyId: prop1.id,
      assignedTechId: tech.id,
      status: 'scheduled',
      jobType: 'spring_activation',
      scheduledStart: tomorrow,
      scheduledEnd: endMorning,
      notes: 'Perform standard spring check-up. Inspect for backflow leaks.',
      routeSequence: 1,
    },
  });

  const job2 = await prisma.job.create({
    data: {
      orgId: org.id,
      propertyId: prop2.id,
      assignedTechId: tech.id,
      status: 'scheduled',
      jobType: 'repair',
      scheduledStart: tomorrowAfternoon,
      scheduledEnd: endAfternoon,
      notes: 'Zones 2 and 3 not popping up. Possible solenoids replacement needed.',
      routeSequence: 2,
    },
  });
  console.log('Created scheduled jobs with sequential technician routes.');

  // 7. Create Quotes & Invoices
  const designObj = {
    zones: [
      { id: 'z1', name: 'Front Lawn Spray', nodes: [{ x: 10, y: 20, type: 'RAINBIRD-1804' }] },
      { id: 'z2', name: 'Back Yard Rotors', nodes: [{ x: 50, y: 80, type: 'HUNTER-PGP-04' }] }
    ]
  };

  const quote = await prisma.quote.create({
    data: {
      orgId: org.id,
      propertyId: prop1.id,
      status: 'accepted',
      designData: JSON.stringify(designObj),
      totalAmount: 185.00,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      customerId: customer1.id,
      quoteId: quote.id,
      status: 'paid',
      totalAmount: 185.00,
      taxAmount: 15.00,
      dueDate: new Date(),
    },
  });
  console.log('Created sample quotes and paid invoices.');

  console.log('Seeding completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error during database seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
