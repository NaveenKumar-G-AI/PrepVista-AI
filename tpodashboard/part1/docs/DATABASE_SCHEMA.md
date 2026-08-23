# Database Schema

Generated from the actual live schema (`psql \d+`) after running
`alembic upgrade head` (both migrations) against a real PostgreSQL 16
database — not hand-written from the models, so this is guaranteed to
match reality.

**24 tables**, created by two migrations:
`1ba39f1db191_initial_schema.py` (Part 1) and
`7b6a5c033ed6_part_2_companies_drives_applications_.py` (Part 2).

## `institutions`

```
Table "public.institutions"
   Column   |           Type           | Collation | Nullable | Default 
------------+--------------------------+-----------+----------+---------
 name       | character varying(255)   |           | not null | 
 short_code | character varying(32)    |           | not null | 
 is_active  | boolean                  |           | not null | 
 id         | uuid                     |           | not null | 
 created_at | timestamp with time zone |           | not null | now()
 updated_at | timestamp with time zone |           | not null | now()
Indexes:
    "institutions_pkey" PRIMARY KEY, btree (id)
    "institutions_short_code_key" UNIQUE CONSTRAINT, btree (short_code)
Referenced by:
    TABLE "academic_records" CONSTRAINT "academic_records_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "activity_events" CONSTRAINT "activity_events_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "applications" CONSTRAINT "applications_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "audit_records" CONSTRAINT "audit_records_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "batches" CONSTRAINT "batches_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "campuses" CONSTRAINT "campuses_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "companies" CONSTRAINT "companies_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "company_contacts" CONSTRAINT "company_contacts_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "departments" CONSTRAINT "departments_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "documents" CONSTRAINT "documents_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "drives" CONSTRAINT "drives_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "import_batches" CONSTRAINT "import_batches_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "interview_rounds" CONSTRAINT "interview_rounds_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "interview_schedules" CONSTRAINT "interview_schedules_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "offers" CONSTRAINT "offers_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "placement_seasons" CONSTRAINT "placement_seasons_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "professional_profiles" CONSTRAINT "professional_profiles_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "programs" CONSTRAINT "programs_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "readiness_snapshots" CONSTRAINT "readiness_snapshots_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "skills" CONSTRAINT "skills_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "student_skills" CONSTRAINT "student_skills_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "students" CONSTRAINT "students_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    TABLE "users" CONSTRAINT "users_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
```

## `campuses`

```
Table "public.campuses"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 name           | character varying(255)   |           | not null | 
 city           | character varying(120)   |           |          | 
 is_active      | boolean                  |           | not null | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "campuses_pkey" PRIMARY KEY, btree (id)
    "ix_campuses_institution_id" btree (institution_id)
    "uq_campus_institution_name" UNIQUE CONSTRAINT, btree (institution_id, name)
Foreign-key constraints:
    "campuses_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
```

## `departments`

```
Table "public.departments"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 code           | character varying(32)    |           | not null | 
 name           | character varying(255)   |           | not null | 
 is_active      | boolean                  |           | not null | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "departments_pkey" PRIMARY KEY, btree (id)
    "ix_departments_institution_id" btree (institution_id)
    "uq_department_institution_code" UNIQUE CONSTRAINT, btree (institution_id, code)
Foreign-key constraints:
    "departments_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
Referenced by:
    TABLE "programs" CONSTRAINT "programs_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
    TABLE "students" CONSTRAINT "students_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
    TABLE "users" CONSTRAINT "users_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
```

## `programs`

```
Table "public.programs"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 department_id  | uuid                     |           | not null | 
 code           | character varying(32)    |           | not null | 
 name           | character varying(255)   |           | not null | 
 degree_level   | character varying(64)    |           |          | 
 duration_years | integer                  |           |          | 
 is_active      | boolean                  |           | not null | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "programs_pkey" PRIMARY KEY, btree (id)
    "ix_programs_department_id" btree (department_id)
    "ix_programs_institution_id" btree (institution_id)
    "uq_program_department_code" UNIQUE CONSTRAINT, btree (department_id, code)
Foreign-key constraints:
    "programs_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
    "programs_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
Referenced by:
    TABLE "batches" CONSTRAINT "batches_program_id_fkey" FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    TABLE "students" CONSTRAINT "students_program_id_fkey" FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT
```

## `batches`

```
Table "public.batches"
     Column      |           Type           | Collation | Nullable | Default 
-----------------+--------------------------+-----------+----------+---------
 institution_id  | uuid                     |           | not null | 
 program_id      | uuid                     |           | not null | 
 name            | character varying(64)    |           | not null | 
 graduation_year | integer                  |           | not null | 
 is_active       | boolean                  |           | not null | 
 id              | uuid                     |           | not null | 
 created_at      | timestamp with time zone |           | not null | now()
 updated_at      | timestamp with time zone |           | not null | now()
Indexes:
    "batches_pkey" PRIMARY KEY, btree (id)
    "ix_batches_institution_id" btree (institution_id)
    "ix_batches_program_id" btree (program_id)
    "uq_batch_program_year" UNIQUE CONSTRAINT, btree (program_id, graduation_year)
Foreign-key constraints:
    "batches_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "batches_program_id_fkey" FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
Referenced by:
    TABLE "students" CONSTRAINT "students_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT
```

## `placement_seasons`

```
Table "public.placement_seasons"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 name           | character varying(64)    |           | not null | 
 start_date     | date                     |           |          | 
 end_date       | date                     |           |          | 
 is_active      | boolean                  |           | not null | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "placement_seasons_pkey" PRIMARY KEY, btree (id)
    "ix_placement_seasons_institution_id" btree (institution_id)
    "uq_season_institution_name" UNIQUE CONSTRAINT, btree (institution_id, name)
Foreign-key constraints:
    "placement_seasons_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
Referenced by:
    TABLE "activity_events" CONSTRAINT "activity_events_season_id_fkey" FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE SET NULL
    TABLE "drives" CONSTRAINT "drives_season_id_fkey" FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE SET NULL
    TABLE "students" CONSTRAINT "students_season_id_fkey" FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE SET NULL
```

## `users`

```
Table "public.users"
     Column      |           Type           | Collation | Nullable | Default 
-----------------+--------------------------+-----------+----------+---------
 institution_id  | uuid                     |           |          | 
 email           | character varying(255)   |           | not null | 
 full_name       | character varying(255)   |           | not null | 
 hashed_password | character varying(255)   |           | not null | 
 role            | user_role                |           | not null | 
 department_id   | uuid                     |           |          | 
 is_active       | boolean                  |           | not null | 
 id              | uuid                     |           | not null | 
 created_at      | timestamp with time zone |           | not null | now()
 updated_at      | timestamp with time zone |           | not null | now()
Indexes:
    "users_pkey" PRIMARY KEY, btree (id)
    "ix_users_email" btree (email)
    "ix_users_institution_id" btree (institution_id)
    "uq_user_institution_email" UNIQUE CONSTRAINT, btree (institution_id, email)
Foreign-key constraints:
    "users_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    "users_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
Referenced by:
    TABLE "activity_events" CONSTRAINT "activity_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    TABLE "audit_records" CONSTRAINT "audit_records_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    TABLE "companies" CONSTRAINT "companies_recruiter_owner_user_id_fkey" FOREIGN KEY (recruiter_owner_user_id) REFERENCES users(id) ON DELETE SET NULL
    TABLE "documents" CONSTRAINT "documents_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
    TABLE "documents" CONSTRAINT "documents_uploaded_by_user_id_fkey" FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    TABLE "import_batches" CONSTRAINT "import_batches_uploaded_by_user_id_fkey" FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
```

## `students`

```
Table "public.students"
         Column         |           Type           | Collation | Nullable | Default 
------------------------+--------------------------+-----------+----------+---------
 institution_id         | uuid                     |           | not null | 
 season_id              | uuid                     |           |          | 
 batch_id               | uuid                     |           | not null | 
 department_id          | uuid                     |           | not null | 
 program_id             | uuid                     |           | not null | 
 register_number        | character varying(64)    |           | not null | 
 roll_number            | character varying(64)    |           |          | 
 full_name              | character varying(255)   |           | not null | 
 institutional_email    | character varying(255)   |           |          | 
 personal_email         | character varying(255)   |           |          | 
 phone                  | character varying(32)    |           |          | 
 gender                 | gender                   |           |          | 
 date_of_birth          | date                     |           |          | 
 status                 | student_status           |           | not null | 
 placement_status       | placement_status         |           | not null | 
 profile_completion_pct | integer                  |           | not null | 
 source                 | character varying(32)    |           | not null | 
 import_batch_id        | uuid                     |           |          | 
 id                     | uuid                     |           | not null | 
 created_at             | timestamp with time zone |           | not null | now()
 updated_at             | timestamp with time zone |           | not null | now()
Indexes:
    "students_pkey" PRIMARY KEY, btree (id)
    "ix_students_batch_id" btree (batch_id)
    "ix_students_department_id" btree (department_id)
    "ix_students_full_name" btree (full_name)
    "ix_students_institution_id" btree (institution_id)
    "ix_students_institutional_email" btree (institutional_email)
    "ix_students_personal_email" btree (personal_email)
    "ix_students_phone" btree (phone)
    "ix_students_program_id" btree (program_id)
    "ix_students_register_number" btree (register_number)
    "ix_students_roll_number" btree (roll_number)
    "ix_students_season_id" btree (season_id)
    "uq_student_institution_register_number" UNIQUE CONSTRAINT, btree (institution_id, register_number)
Foreign-key constraints:
    "students_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT
    "students_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
    "students_import_batch_id_fkey" FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL
    "students_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "students_program_id_fkey" FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT
    "students_season_id_fkey" FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE SET NULL
Referenced by:
    TABLE "academic_records" CONSTRAINT "academic_records_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    TABLE "applications" CONSTRAINT "applications_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    TABLE "documents" CONSTRAINT "documents_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    TABLE "offers" CONSTRAINT "offers_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    TABLE "professional_profiles" CONSTRAINT "professional_profiles_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    TABLE "readiness_snapshots" CONSTRAINT "readiness_snapshots_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    TABLE "student_skills" CONSTRAINT "student_skills_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
```

## `academic_records`

```
Table "public.academic_records"
        Column        |           Type           | Collation | Nullable | Default 
----------------------+--------------------------+-----------+----------+---------
 institution_id       | uuid                     |           | not null | 
 student_id           | uuid                     |           | not null | 
 semester             | integer                  |           | not null | 
 gpa                  | numeric(4,2)             |           |          | 
 cumulative_cgpa      | numeric(4,2)             |           |          | 
 percentage           | numeric(5,2)             |           |          | 
 backlog_count        | integer                  |           | not null | 
 active_backlog_count | integer                  |           | not null | 
 academic_status      | character varying(32)    |           |          | 
 verified             | boolean                  |           | not null | 
 source               | character varying(32)    |           | not null | 
 id                   | uuid                     |           | not null | 
 created_at           | timestamp with time zone |           | not null | now()
 updated_at           | timestamp with time zone |           | not null | now()
Indexes:
    "academic_records_pkey" PRIMARY KEY, btree (id)
    "ix_academic_records_institution_id" btree (institution_id)
    "ix_academic_records_student_id" btree (student_id)
    "uq_academic_student_semester" UNIQUE CONSTRAINT, btree (student_id, semester)
Foreign-key constraints:
    "academic_records_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "academic_records_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
```

## `professional_profiles`

```
Table "public.professional_profiles"
         Column         |           Type           | Collation | Nullable | Default 
------------------------+--------------------------+-----------+----------+---------
 institution_id         | uuid                     |           | not null | 
 student_id             | uuid                     |           | not null | 
 headline               | character varying(255)   |           |          | 
 preferred_roles        | jsonb                    |           |          | 
 preferred_locations    | jsonb                    |           |          | 
 salary_expectation_lpa | numeric(6,2)             |           |          | 
 career_interests       | text                     |           |          | 
 linkedin_url           | character varying(512)   |           |          | 
 github_url             | character varying(512)   |           |          | 
 portfolio_url          | character varying(512)   |           |          | 
 resume_document_id     | uuid                     |           |          | 
 id                     | uuid                     |           | not null | 
 created_at             | timestamp with time zone |           | not null | now()
 updated_at             | timestamp with time zone |           | not null | now()
Indexes:
    "professional_profiles_pkey" PRIMARY KEY, btree (id)
    "ix_professional_profiles_institution_id" btree (institution_id)
    "professional_profiles_student_id_key" UNIQUE CONSTRAINT, btree (student_id)
Foreign-key constraints:
    "professional_profiles_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "professional_profiles_resume_document_id_fkey" FOREIGN KEY (resume_document_id) REFERENCES documents(id) ON DELETE SET NULL
    "professional_profiles_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
```

## `skills`

```
Table "public.skills"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 name           | character varying(120)   |           | not null | 
 category       | character varying(120)   |           |          | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "skills_pkey" PRIMARY KEY, btree (id)
    "ix_skills_institution_id" btree (institution_id)
    "uq_skill_institution_name" UNIQUE CONSTRAINT, btree (institution_id, name)
Foreign-key constraints:
    "skills_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
Referenced by:
    TABLE "student_skills" CONSTRAINT "student_skills_skill_id_fkey" FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
```

## `student_skills`

```
Table "public.student_skills"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 student_id     | uuid                     |           | not null | 
 skill_id       | uuid                     |           | not null | 
 proficiency    | integer                  |           |          | 
 source         | character varying(64)    |           | not null | 
 verified       | boolean                  |           | not null | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "student_skills_pkey" PRIMARY KEY, btree (id)
    "ix_student_skills_institution_id" btree (institution_id)
    "ix_student_skills_skill_id" btree (skill_id)
    "ix_student_skills_student_id" btree (student_id)
    "uq_student_skill" UNIQUE CONSTRAINT, btree (student_id, skill_id)
Foreign-key constraints:
    "student_skills_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "student_skills_skill_id_fkey" FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    "student_skills_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
```

## `documents`

```
Table "public.documents"
       Column        |           Type           | Collation | Nullable | Default 
---------------------+--------------------------+-----------+----------+---------
 institution_id      | uuid                     |           | not null | 
 student_id          | uuid                     |           |          | 
 owner_user_id       | uuid                     |           |          | 
 document_type       | document_type            |           | not null | 
 filename            | character varying(512)   |           | not null | 
 storage_key         | character varying(1024)  |           | not null | 
 mime_type           | character varying(128)   |           |          | 
 size_bytes          | integer                  |           |          | 
 checksum_sha256     | character varying(64)    |           |          | 
 uploaded_by_user_id | uuid                     |           |          | 
 uploaded_at         | timestamp with time zone |           | not null | 
 id                  | uuid                     |           | not null | 
 created_at          | timestamp with time zone |           | not null | now()
 updated_at          | timestamp with time zone |           | not null | now()
Indexes:
    "documents_pkey" PRIMARY KEY, btree (id)
    "ix_documents_institution_id" btree (institution_id)
    "ix_documents_student_id" btree (student_id)
Foreign-key constraints:
    "documents_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "documents_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
    "documents_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    "documents_uploaded_by_user_id_fkey" FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
Referenced by:
    TABLE "professional_profiles" CONSTRAINT "professional_profiles_resume_document_id_fkey" FOREIGN KEY (resume_document_id) REFERENCES documents(id) ON DELETE SET NULL
```

## `import_batches`

```
Table "public.import_batches"
       Column        |           Type           | Collation | Nullable | Default 
---------------------+--------------------------+-----------+----------+---------
 institution_id      | uuid                     |           | not null | 
 uploaded_by_user_id | uuid                     |           |          | 
 original_filename   | character varying(512)   |           | not null | 
 storage_key         | character varying(1024)  |           | not null | 
 status              | import_status            |           | not null | 
 column_mapping      | jsonb                    |           |          | 
 total_rows          | integer                  |           | not null | 
 valid_rows          | integer                  |           | not null | 
 invalid_rows        | integer                  |           | not null | 
 duplicate_rows      | integer                  |           | not null | 
 imported_count      | integer                  |           | not null | 
 updated_count       | integer                  |           | not null | 
 ignored_count       | integer                  |           | not null | 
 attention_count     | integer                  |           | not null | 
 report              | jsonb                    |           |          | 
 committed_at        | timestamp with time zone |           |          | 
 id                  | uuid                     |           | not null | 
 created_at          | timestamp with time zone |           | not null | now()
 updated_at          | timestamp with time zone |           | not null | now()
Indexes:
    "import_batches_pkey" PRIMARY KEY, btree (id)
    "ix_import_batches_institution_id" btree (institution_id)
Foreign-key constraints:
    "import_batches_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "import_batches_uploaded_by_user_id_fkey" FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
Referenced by:
    TABLE "students" CONSTRAINT "students_import_batch_id_fkey" FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL
```

## `companies`

```
Table "public.companies"
         Column          |           Type           | Collation | Nullable | Default 
-------------------------+--------------------------+-----------+----------+---------
 institution_id          | uuid                     |           | not null | 
 name                    | character varying(255)   |           | not null | 
 industry                | character varying(120)   |           |          | 
 website                 | character varying(512)   |           |          | 
 city                    | character varying(120)   |           |          | 
 pipeline_stage          | pipeline_stage           |           | not null | 
 recruiter_owner_user_id | uuid                     |           |          | 
 notes                   | text                     |           |          | 
 is_active               | boolean                  |           | not null | 
 id                      | uuid                     |           | not null | 
 created_at              | timestamp with time zone |           | not null | now()
 updated_at              | timestamp with time zone |           | not null | now()
Indexes:
    "companies_pkey" PRIMARY KEY, btree (id)
    "ix_companies_institution_id" btree (institution_id)
    "uq_company_institution_name" UNIQUE CONSTRAINT, btree (institution_id, name)
Foreign-key constraints:
    "companies_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "companies_recruiter_owner_user_id_fkey" FOREIGN KEY (recruiter_owner_user_id) REFERENCES users(id) ON DELETE SET NULL
Referenced by:
    TABLE "company_contacts" CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    TABLE "drives" CONSTRAINT "drives_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    TABLE "offers" CONSTRAINT "offers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
```

## `company_contacts`

```
Table "public.company_contacts"
      Column       |           Type           | Collation | Nullable | Default 
-------------------+--------------------------+-----------+----------+---------
 institution_id    | uuid                     |           | not null | 
 company_id        | uuid                     |           | not null | 
 name              | character varying(255)   |           | not null | 
 role_title        | character varying(120)   |           |          | 
 email             | character varying(255)   |           |          | 
 phone             | character varying(32)    |           |          | 
 is_primary        | boolean                  |           | not null | 
 last_contacted_at | date                     |           |          | 
 next_follow_up_at | date                     |           |          | 
 id                | uuid                     |           | not null | 
 created_at        | timestamp with time zone |           | not null | now()
 updated_at        | timestamp with time zone |           | not null | now()
Indexes:
    "company_contacts_pkey" PRIMARY KEY, btree (id)
    "ix_company_contacts_company_id" btree (company_id)
    "ix_company_contacts_institution_id" btree (institution_id)
Foreign-key constraints:
    "company_contacts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    "company_contacts_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
```

## `drives`

```
Table "public.drives"
         Column          |           Type           | Collation | Nullable | Default 
-------------------------+--------------------------+-----------+----------+---------
 institution_id          | uuid                     |           | not null | 
 season_id               | uuid                     |           |          | 
 company_id              | uuid                     |           | not null | 
 role                    | character varying(255)   |           | not null | 
 job_type                | character varying(32)    |           | not null | 
 ctc_lpa                 | numeric(6,2)             |           |          | 
 location                | character varying(255)   |           |          | 
 status                  | drive_status             |           | not null | 
 min_cgpa                | numeric(4,2)             |           | not null | 
 max_backlogs            | integer                  |           | not null | 
 eligible_department_ids | uuid[]                   |           |          | 
 application_deadline    | date                     |           |          | 
 drive_date              | date                     |           |          | 
 id                      | uuid                     |           | not null | 
 created_at              | timestamp with time zone |           | not null | now()
 updated_at              | timestamp with time zone |           | not null | now()
Indexes:
    "drives_pkey" PRIMARY KEY, btree (id)
    "ix_drives_company_id" btree (company_id)
    "ix_drives_institution_id" btree (institution_id)
    "ix_drives_season_id" btree (season_id)
Foreign-key constraints:
    "drives_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    "drives_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "drives_season_id_fkey" FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE SET NULL
Referenced by:
    TABLE "applications" CONSTRAINT "applications_drive_id_fkey" FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE
    TABLE "interview_rounds" CONSTRAINT "interview_rounds_drive_id_fkey" FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE
```

## `interview_rounds`

```
Table "public.interview_rounds"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 drive_id       | uuid                     |           | not null | 
 name           | character varying(120)   |           | not null | 
 sequence_order | integer                  |           | not null | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "interview_rounds_pkey" PRIMARY KEY, btree (id)
    "ix_interview_rounds_drive_id" btree (drive_id)
    "ix_interview_rounds_institution_id" btree (institution_id)
Foreign-key constraints:
    "interview_rounds_drive_id_fkey" FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE
    "interview_rounds_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
Referenced by:
    TABLE "interview_schedules" CONSTRAINT "interview_schedules_round_id_fkey" FOREIGN KEY (round_id) REFERENCES interview_rounds(id) ON DELETE CASCADE
```

## `applications`

```
Table "public.applications"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 institution_id | uuid                     |           | not null | 
 drive_id       | uuid                     |           | not null | 
 student_id     | uuid                     |           | not null | 
 stage          | application_stage        |           | not null | 
 applied_at     | timestamp with time zone |           | not null | 
 id             | uuid                     |           | not null | 
 created_at     | timestamp with time zone |           | not null | now()
 updated_at     | timestamp with time zone |           | not null | now()
Indexes:
    "applications_pkey" PRIMARY KEY, btree (id)
    "ix_applications_drive_id" btree (drive_id)
    "ix_applications_institution_id" btree (institution_id)
    "ix_applications_student_id" btree (student_id)
    "uq_application_drive_student" UNIQUE CONSTRAINT, btree (drive_id, student_id)
Foreign-key constraints:
    "applications_drive_id_fkey" FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE
    "applications_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "applications_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
Referenced by:
    TABLE "interview_schedules" CONSTRAINT "interview_schedules_application_id_fkey" FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    TABLE "offers" CONSTRAINT "offers_application_id_fkey" FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
```

## `interview_schedules`

```
Table "public.interview_schedules"
      Column      |           Type           | Collation | Nullable | Default 
------------------+--------------------------+-----------+----------+---------
 institution_id   | uuid                     |           | not null | 
 application_id   | uuid                     |           | not null | 
 round_id         | uuid                     |           | not null | 
 scheduled_at     | timestamp with time zone |           |          | 
 status           | schedule_status          |           | not null | 
 result           | round_result             |           | not null | 
 interviewer_name | character varying(255)   |           |          | 
 feedback         | text                     |           |          | 
 id               | uuid                     |           | not null | 
 created_at       | timestamp with time zone |           | not null | now()
 updated_at       | timestamp with time zone |           | not null | now()
Indexes:
    "interview_schedules_pkey" PRIMARY KEY, btree (id)
    "ix_interview_schedules_application_id" btree (application_id)
    "ix_interview_schedules_institution_id" btree (institution_id)
    "ix_interview_schedules_round_id" btree (round_id)
Foreign-key constraints:
    "interview_schedules_application_id_fkey" FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    "interview_schedules_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "interview_schedules_round_id_fkey" FOREIGN KEY (round_id) REFERENCES interview_rounds(id) ON DELETE CASCADE
```

## `offers`

```
Table "public.offers"
      Column       |           Type           | Collation | Nullable | Default 
-------------------+--------------------------+-----------+----------+---------
 institution_id    | uuid                     |           | not null | 
 application_id    | uuid                     |           | not null | 
 student_id        | uuid                     |           | not null | 
 company_id        | uuid                     |           | not null | 
 ctc_lpa           | numeric(6,2)             |           |          | 
 status            | offer_status             |           | not null | 
 extended_at       | timestamp with time zone |           | not null | 
 expiry_date       | date                     |           |          | 
 accepted_at       | timestamp with time zone |           |          | 
 joining_date      | date                     |           |          | 
 joining_confirmed | boolean                  |           | not null | 
 id                | uuid                     |           | not null | 
 created_at        | timestamp with time zone |           | not null | now()
 updated_at        | timestamp with time zone |           | not null | now()
Indexes:
    "offers_pkey" PRIMARY KEY, btree (id)
    "ix_offers_application_id" UNIQUE, btree (application_id)
    "ix_offers_company_id" btree (company_id)
    "ix_offers_institution_id" btree (institution_id)
    "ix_offers_student_id" btree (student_id)
Foreign-key constraints:
    "offers_application_id_fkey" FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    "offers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    "offers_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "offers_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
```

## `activity_events`

```
Table "public.activity_events"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 id             | uuid                     |           | not null | 
 institution_id | uuid                     |           | not null | 
 season_id      | uuid                     |           |          | 
 actor_user_id  | uuid                     |           |          | 
 entity_type    | character varying(64)    |           | not null | 
 entity_id      | uuid                     |           | not null | 
 event_type     | character varying(64)    |           | not null | 
 event_metadata | jsonb                    |           |          | 
 created_at     | timestamp with time zone |           | not null | now()
Indexes:
    "activity_events_pkey" PRIMARY KEY, btree (id)
    "ix_activity_events_entity_id" btree (entity_id)
    "ix_activity_events_entity_type" btree (entity_type)
    "ix_activity_events_event_type" btree (event_type)
    "ix_activity_events_institution_id" btree (institution_id)
    "ix_activity_events_season_id" btree (season_id)
Foreign-key constraints:
    "activity_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    "activity_events_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "activity_events_season_id_fkey" FOREIGN KEY (season_id) REFERENCES placement_seasons(id) ON DELETE SET NULL
```

## `audit_records`

```
Table "public.audit_records"
     Column     |           Type           | Collation | Nullable | Default 
----------------+--------------------------+-----------+----------+---------
 id             | uuid                     |           | not null | 
 institution_id | uuid                     |           | not null | 
 actor_user_id  | uuid                     |           |          | 
 entity_type    | character varying(64)    |           | not null | 
 entity_id      | uuid                     |           | not null | 
 action         | character varying(64)    |           | not null | 
 event_metadata | jsonb                    |           |          | 
 created_at     | timestamp with time zone |           | not null | now()
Indexes:
    "audit_records_pkey" PRIMARY KEY, btree (id)
    "ix_audit_records_entity_id" btree (entity_id)
    "ix_audit_records_entity_type" btree (entity_type)
    "ix_audit_records_institution_id" btree (institution_id)
Foreign-key constraints:
    "audit_records_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    "audit_records_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
```

## `readiness_snapshots`

```
Table "public.readiness_snapshots"
     Column      |           Type           | Collation | Nullable | Default 
-----------------+--------------------------+-----------+----------+---------
 id              | uuid                     |           | not null | 
 institution_id  | uuid                     |           | not null | 
 student_id      | uuid                     |           | not null | 
 overall_score   | integer                  |           | not null | 
 skill_breakdown | jsonb                    |           |          | 
 source          | character varying(64)    |           | not null | 
 computed_at     | timestamp with time zone |           | not null | now()
Indexes:
    "readiness_snapshots_pkey" PRIMARY KEY, btree (id)
    "ix_readiness_snapshots_institution_id" btree (institution_id)
    "ix_readiness_snapshots_student_id" btree (student_id)
Foreign-key constraints:
    "readiness_snapshots_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
    "readiness_snapshots_student_id_fkey" FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
```

