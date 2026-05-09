-- ============================================================
-- Factories Act, 1948 — Full Register Set
-- Adds core mandatory + conditional factory registers
-- ============================================================

-- ─── A. CORE MANDATORY FACTORY REGISTERS ───

-- Notice of Periods of Work for Adult Workers (Sec 61-63)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'NOTICE_PERIODS_OF_WORK',
  'Notice of Periods of Work for Adult Workers',
  'Notice displaying periods of work for adult workers as required under Sec 61-63 of Factories Act, 1948',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"group_relay","header":"Group / Relay","source":"","width":14},
    {"key":"work_start","header":"Work Begins At","source":"","width":12},
    {"key":"interval_start","header":"Interval Begins","source":"","width":12},
    {"key":"interval_end","header":"Interval Ends","source":"","width":12},
    {"key":"work_end","header":"Work Ends At","source":"","width":12},
    {"key":"weekly_holiday","header":"Weekly Holiday","source":"","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":16}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Register of Child / Adolescent Workers
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'CHILD_WORKER_REGISTER',
  'Register of Child / Adolescent Workers',
  'Register of young persons employed as required under Sec 68-69 of Factories Act, 1948',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"name","header":"Name","source":"FIELD:employee_name","width":22},
    {"key":"father_name","header":"Father Name","source":"FIELD:father_name","width":18},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"sex","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"nature_of_work","header":"Nature of Work","source":"FIELD:designation","width":16},
    {"key":"certificate_no","header":"Certificate No.","source":"","width":14},
    {"key":"hours_of_work","header":"Hours of Work","source":"","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Register of Compensatory Holidays
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'COMPENSATORY_HOLIDAY_REGISTER',
  'Register of Compensatory Holidays',
  'Record of compensatory holidays granted as required under Factories Act / State Rules',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":22},
    {"key":"date_worked","header":"Date on Which Worked","source":"","width":14},
    {"key":"compensatory_date","header":"Compensatory Holiday Date","source":"","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Leave Book / Worker Leave Record
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'LEAVE_BOOK',
  'Leave Book / Worker Leave Record',
  'Individual leave record maintained per worker under Factories Act / Model Rules',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'ANNUAL', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":22},
    {"key":"leave_due","header":"Leave Due (Opening)","source":"","width":14},
    {"key":"leave_taken","header":"Leave Taken","source":"","width":12},
    {"key":"leave_balance","header":"Leave Balance","source":"","width":12},
    {"key":"leave_encashed","header":"Leave Encashed","source":"","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Inspection Book
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'INSPECTION_BOOK',
  'Inspection Book / Record of Inspector Remarks',
  'Bound book for recording defects/irregularities noted by factory inspectors under State Rules',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"date_of_inspection","header":"Date of Inspection","source":"","width":14},
    {"key":"name_of_inspector","header":"Name of Inspector","source":"","width":20},
    {"key":"defects_noted","header":"Defects / Irregularities Noted","source":"","width":30},
    {"key":"action_taken","header":"Action Taken","source":"","width":24},
    {"key":"date_of_compliance","header":"Date of Compliance","source":"","width":14},
    {"key":"remarks","header":"Remarks","source":"","width":16}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── B. CONDITIONAL FACTORY REGISTERS (Safety / Health / Equipment) ───

-- Dangerous Occurrence Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'DANGEROUS_OCCURRENCE_REGISTER',
  'Dangerous Occurrence Register',
  'Register of dangerous occurrences as required under Factories Act for reporting to authorities',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"date_of_occurrence","header":"Date of Occurrence","source":"","width":14},
    {"key":"time","header":"Time","source":"","width":8},
    {"key":"place","header":"Place / Section","source":"","width":18},
    {"key":"nature","header":"Nature of Occurrence","source":"","width":24},
    {"key":"persons_injured","header":"Persons Injured","source":"","width":12},
    {"key":"cause","header":"Probable Cause","source":"","width":22},
    {"key":"action_taken","header":"Action Taken","source":"","width":20},
    {"key":"reported_to","header":"Reported To","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Pressure Vessel Examination Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'PRESSURE_VESSEL_REGISTER',
  'Pressure Vessel / Plant Examination Register',
  'Record of pressure vessel and plant examinations under Sec 31 of Factories Act',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{"hazardous_process": true}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"vessel_description","header":"Description of Vessel / Plant","source":"","width":24},
    {"key":"location","header":"Location","source":"","width":14},
    {"key":"date_of_exam","header":"Date of Examination","source":"","width":14},
    {"key":"examined_by","header":"Examined By (Competent Person)","source":"","width":20},
    {"key":"max_pressure","header":"Max Safe Working Pressure","source":"","width":16},
    {"key":"defects_found","header":"Defects Found","source":"","width":20},
    {"key":"repairs_done","header":"Repairs / Action","source":"","width":18},
    {"key":"next_exam_due","header":"Next Exam Due","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Lifting Machine / Tackle Examination Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'LIFTING_MACHINE_REGISTER',
  'Lifting Machine / Tackle Examination Register',
  'Record of examination of lifting machines, chains, ropes and lifting tackle under Sec 29 of Factories Act',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{"hazardous_process": true}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"machine_description","header":"Description of Machine / Tackle","source":"","width":24},
    {"key":"safe_working_load","header":"Safe Working Load","source":"","width":14},
    {"key":"date_of_exam","header":"Date of Examination","source":"","width":14},
    {"key":"examined_by","header":"Examined By (Competent Person)","source":"","width":20},
    {"key":"condition","header":"Condition","source":"","width":14},
    {"key":"defects","header":"Defects Found","source":"","width":18},
    {"key":"next_exam_due","header":"Next Exam Due","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Hoist / Lift Examination Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'HOIST_LIFT_REGISTER',
  'Hoist / Lift Examination Register',
  'Record of hoist and lift examinations under Sec 28 of Factories Act',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{"hazardous_process": true}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"hoist_description","header":"Description of Hoist / Lift","source":"","width":22},
    {"key":"safe_working_load","header":"Safe Working Load","source":"","width":14},
    {"key":"date_of_exam","header":"Date of Examination","source":"","width":14},
    {"key":"examined_by","header":"Examined By (Competent Person)","source":"","width":20},
    {"key":"condition","header":"Condition","source":"","width":14},
    {"key":"defects","header":"Defects Found","source":"","width":18},
    {"key":"next_exam_due","header":"Next Exam Due","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Medical Examination Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'MEDICAL_EXAMINATION_REGISTER',
  'Medical Examination Register',
  'Record of medical examinations for workers in dangerous operations under Sec 87 of Factories Act',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{"hazardous_process": true}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":22},
    {"key":"process_section","header":"Process / Section","source":"","width":16},
    {"key":"date_of_exam","header":"Date of Examination","source":"","width":14},
    {"key":"examining_doctor","header":"Examining Doctor","source":"","width":18},
    {"key":"fitness_certificate","header":"Fitness Certificate No.","source":"","width":14},
    {"key":"result","header":"Result (Fit/Unfit)","source":"","width":14},
    {"key":"next_exam_due","header":"Next Exam Due","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Humidity Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'HUMIDITY_REGISTER',
  'Humidity Register',
  'Record of humidity readings in factory premises under Factories Act',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'MONTHLY', '{"hazardous_process": true}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"date","header":"Date","source":"","width":12},
    {"key":"time","header":"Time","source":"","width":8},
    {"key":"section","header":"Section / Room","source":"","width":16},
    {"key":"dry_bulb","header":"Dry Bulb (°C)","source":"","width":12},
    {"key":"wet_bulb","header":"Wet Bulb (°C)","source":"","width":12},
    {"key":"humidity","header":"Relative Humidity %","source":"","width":14},
    {"key":"action_taken","header":"Action Taken","source":"","width":18},
    {"key":"remarks","header":"Remarks","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Whitewashing / Painting / Cleaning Record
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'WHITEWASHING_RECORD',
  'Whitewashing / Painting / Cleaning Record',
  'Record of whitewashing, painting, and cleaning of factory premises as per sanitation requirements',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"area","header":"Area / Section","source":"","width":18},
    {"key":"nature_of_work","header":"Nature of Work (Whitewash/Paint/Clean)","source":"","width":22},
    {"key":"date_carried_out","header":"Date Carried Out","source":"","width":14},
    {"key":"done_by","header":"Done By (Contractor/Staff)","source":"","width":18},
    {"key":"next_due_date","header":"Next Due Date","source":"","width":14},
    {"key":"remarks","header":"Remarks","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Hazardous Process Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'HAZARDOUS_PROCESS_REGISTER',
  'Hazardous Process Records',
  'Records related to hazardous processes including safety measures, workers involved, and monitoring data',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{"hazardous_process": true}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"process_name","header":"Hazardous Process","source":"","width":22},
    {"key":"section","header":"Section / Area","source":"","width":16},
    {"key":"workers_involved","header":"No. of Workers","source":"","width":12},
    {"key":"safety_measures","header":"Safety Measures in Place","source":"","width":24},
    {"key":"monitoring_date","header":"Last Monitoring Date","source":"","width":14},
    {"key":"monitoring_result","header":"Monitoring Result","source":"","width":16},
    {"key":"action_required","header":"Action Required","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Dangerous Operation Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'DANGEROUS_OPERATION_REGISTER',
  'Dangerous Operation Records',
  'Records for workers involved in dangerous operations as per Schedule under Factories Act Sec 87',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{"hazardous_process": true}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"","width":6},
    {"key":"operation_name","header":"Dangerous Operation","source":"","width":22},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":22},
    {"key":"duration_of_exposure","header":"Duration of Exposure","source":"","width":14},
    {"key":"protective_equipment","header":"Protective Equipment Provided","source":"","width":22},
    {"key":"medical_exam_date","header":"Last Medical Exam","source":"","width":14},
    {"key":"remarks","header":"Remarks","source":"","width":14}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── C. UPDATE LAW_FAMILY for existing FACTORIES_ACT registers ───
UPDATE register_templates SET law_family = 'FACTORIES_ACT'
  WHERE register_type IN ('ADULT_WORKER_REGISTER', 'ACCIDENT_REGISTER')
    AND (law_family IS NULL OR law_family = 'FACTORIES_ACT');
