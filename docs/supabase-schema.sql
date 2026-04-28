-- ============================================================================
-- Project Management System - Supabase PostgreSQL Schema
-- Migration from Google Sheets to Supabase
-- ============================================================================
-- This schema includes 10 main tables with proper relationships, indexes, and RLS
-- Last Updated: 2024
-- ============================================================================

-- Drop existing tables if migration is being re-run (development only)
-- DROP TABLE IF EXISTS risks CASCADE;
-- DROP TABLE IF EXISTS issues CASCADE;
-- DROP TABLE IF EXISTS change_request_items CASCADE;
-- DROP TABLE IF EXISTS change_requests CASCADE;
-- DROP TABLE IF EXISTS efforts CASCADE;
-- DROP TABLE IF EXISTS milestones CASCADE;
-- DROP TABLE IF EXISTS tasks CASCADE;
-- DROP TABLE IF EXISTS members CASCADE;
-- DROP TABLE IF EXISTS projects CASCADE;

-- ============================================================================
-- 1. PROJECTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  client VARCHAR(255),
  status VARCHAR(50) DEFAULT 'Planning' CHECK (status IN ('Planning', 'Req & Design', 'Setup', 'Testing', 'Go Live', 'Hyper Care')),
  color VARCHAR(20),
  start_date DATE,
  end_date DATE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  owner_id UUID
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_code ON projects(code);
CREATE INDEX idx_projects_owner ON projects(owner_id);

-- ============================================================================
-- 2. MEMBERS (Team)
-- ============================================================================
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  role VARCHAR(100) DEFAULT 'team-member',
  department VARCHAR(100),
  phone VARCHAR(20),
  avatar_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_role ON members(role);
CREATE INDEX idx_members_status ON members(status);

-- ============================================================================
-- 3. TASKS (with hierarchical support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  
  wbs VARCHAR(100),
  task_name VARCHAR(255) NOT NULL,
  phase VARCHAR(100),
  description TEXT,
  
  -- Dates
  start_date DATE,
  end_date DATE,
  actual_finish DATE,
  
  -- Progress
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  
  -- Dependencies
  related_task UUID REFERENCES tasks(id),
  
  -- Duration (calculated in days)
  duration INTEGER DEFAULT 1,
  
  -- Assignments
  assigned_to VARCHAR(255),
  
  -- Hierarchy and ordering
  level INTEGER DEFAULT 0,
  "order" INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_start_date ON tasks(start_date);
CREATE INDEX idx_tasks_related_task ON tasks(related_task);

-- ============================================================================
-- 4. MILESTONES
-- ============================================================================
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  phase VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  amount DECIMAL(15,2) DEFAULT 0,
  phase_amount DECIMAL(15,2) DEFAULT 0,
  due_date DATE,
  
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'billed', 'paid')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_milestones_project ON milestones(project_id);
CREATE INDEX idx_milestones_status ON milestones(status);
CREATE INDEX idx_milestones_due_date ON milestones(due_date);

-- ============================================================================
-- 5. EFFORTS (Manday tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS efforts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  role VARCHAR(100) NOT NULL,
  budget_manday INTEGER DEFAULT 0,
  
  -- Monthly tracking as JSONB: { "2024-01": 10, "2024-02": 12, ... }
  monthly JSONB DEFAULT '{}'::jsonb,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_efforts_project ON efforts(project_id);
CREATE INDEX idx_efforts_role ON efforts(role);

-- ============================================================================
-- 6. CHANGE REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  cr_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  requested_by VARCHAR(255),
  request_date DATE,
  
  approved_by VARCHAR(255),
  approval_date DATE,
  
  status VARCHAR(50) DEFAULT 'Draft' CHECK (status IN (
    'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Implemented', 'Close'
  )),
  
  total_manday INTEGER DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_change_requests_project ON change_requests(project_id);
CREATE INDEX idx_change_requests_status ON change_requests(status);
CREATE INDEX idx_change_requests_cr_id ON change_requests(cr_id);
CREATE INDEX idx_change_requests_requested_by ON change_requests(requested_by);

-- ============================================================================
-- 7. CHANGE REQUEST ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS change_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  
  detail TEXT NOT NULL,
  manday INTEGER DEFAULT 0,
  
  sequence_num INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cr_items_cr ON change_request_items(change_request_id);
CREATE INDEX idx_cr_items_sequence ON change_request_items(sequence_num);

-- ============================================================================
-- 8. ISSUES
-- ============================================================================
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  issue_date DATE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  reported_by VARCHAR(255),
  assigned_to VARCHAR(255),
  
  status VARCHAR(50) DEFAULT 'Open' CHECK (status IN (
    'Open', 'In Progress', 'Resolved', 'Blocked'
  )),
  
  resolved_date DATE,
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_issues_project ON issues(project_id);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_assigned_to ON issues(assigned_to);
CREATE INDEX idx_issues_reported_by ON issues(reported_by);
CREATE INDEX idx_issues_issue_date ON issues(issue_date);

-- ============================================================================
-- 9. RISKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  risk_date DATE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  probability VARCHAR(50) DEFAULT 'Medium' CHECK (probability IN ('Low', 'Medium', 'High')),
  impact VARCHAR(50) DEFAULT 'Medium' CHECK (impact IN ('Low', 'Medium', 'High')),
  
  status VARCHAR(50) DEFAULT 'Monitoring' CHECK (status IN (
    'Monitoring', 'Mitigating', 'Closed'
  )),
  
  owner VARCHAR(255),
  mitigation TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_risks_project ON risks(project_id);
CREATE INDEX idx_risks_status ON risks(status);
CREATE INDEX idx_risks_owner ON risks(owner);
CREATE INDEX idx_risks_probability ON risks(probability);
CREATE INDEX idx_risks_impact ON risks(impact);

-- ============================================================================
-- 10. ACCESS CONTROL & AUDIT
-- ============================================================================

-- User/Auth table (optional - link to Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log (optional)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  table_name VARCHAR(100),
  action VARCHAR(50) CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id UUID,
  changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Enable after testing
-- ============================================================================
-- Uncomment to enable RLS in production

-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE efforts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE risks ENABLE ROW LEVEL SECURITY;

-- Example RLS policy: Users can only see projects they own
-- CREATE POLICY "Users can view their own projects"
-- ON projects FOR SELECT
-- USING (owner_id = auth.uid() OR role = 'admin');

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================
-- INSERT INTO projects (name, code, client, status, color, start_date, end_date)
-- VALUES 
--   ('Project Alpha', 'PA-001', 'Acme Corp', 'active', '#4F46E5', '2024-01-01', '2024-06-30'),
--   ('Project Beta', 'PB-001', 'Beta Inc', 'planning', '#10B981', '2024-03-01', '2024-12-31');

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- 1. Ensure Supabase PostgreSQL version >= 13
-- 2. Run this script in the SQL Editor in Supabase Dashboard
-- 3. After schema creation, migrate data from Google Sheets API
-- 4. Enable RLS policies for production security
-- 5. Test foreign key constraints and cascades
-- 6. Create appropriate database roles and permissions
-- 7. Set up automated backups and point-in-time recovery

-- Created: 2024
-- Author: ProjectMS Team
