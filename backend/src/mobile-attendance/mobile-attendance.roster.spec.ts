describe('MobileAttendanceService.roster', () => {
  const originalKioskLive = process.env.FACE_KIOSK_LIVE_ATTENDANCE_ENABLED;
  const originalActivationDelay = process.env.FACE_KIOSK_ACTIVATION_DELAY_MIN;

  const loadService = () => {
    jest.resetModules();
    process.env.FACE_KIOSK_LIVE_ATTENDANCE_ENABLED = 'true';
    process.env.FACE_KIOSK_ACTIVATION_DELAY_MIN = '5';
    return require('./mobile-attendance.service').MobileAttendanceService;
  };

  afterEach(() => {
    if (originalKioskLive == null) {
      delete process.env.FACE_KIOSK_LIVE_ATTENDANCE_ENABLED;
    } else {
      process.env.FACE_KIOSK_LIVE_ATTENDANCE_ENABLED = originalKioskLive;
    }
    if (originalActivationDelay == null) {
      delete process.env.FACE_KIOSK_ACTIVATION_DELAY_MIN;
    } else {
      process.env.FACE_KIOSK_ACTIVATION_DELAY_MIN = originalActivationDelay;
    }
    jest.resetModules();
  });

  it('returns freshly enrolled kiosk roster entries even during the punch cooldown', async () => {
    const MobileAttendanceService = loadService();
    const faceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          employeeId: 'emp-1',
          clientId: 'client-1',
          branchId: 'branch-1',
          isActive: true,
          enrolledAt: new Date(),
          embedding: Buffer.from([1, 2, 3, 4]),
        },
      ]),
      manager: {
        query: jest
          .fn()
          .mockResolvedValue([{ clientName: 'Client', branchName: 'Branch' }]),
      },
    };
    const contractorFaceRepo = { find: jest.fn().mockResolvedValue([]) };
    const empRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'emp-1', employeeCode: 'E001', name: 'Employee One' },
        ]),
    };
    const svc = new MobileAttendanceService(
      faceRepo,
      contractorFaceRepo,
      {} as any,
      {} as any,
      {} as any,
      empRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const roster = await svc.roster({
      id: 'device-1',
      mode: 'KIOSK',
      clientId: 'client-1',
      branchId: 'branch-1',
      geofenceLat: null,
      geofenceLng: null,
      geofenceRadiusM: null,
      essEmployeeId: null,
    } as any);

    expect(roster.enrollments).toEqual([
      {
        employeeId: 'emp-1',
        employeeCode: 'E001',
        displayName: 'Employee One',
        embeddingB64: Buffer.from([1, 2, 3, 4]).toString('base64'),
      },
    ]);
  });
});
