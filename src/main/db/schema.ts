/**
 * SQLite-Schema in Migrationen organisiert.
 * Jede Migration ist idempotent (CREATE TABLE IF NOT EXISTS), aber wir nutzen
 * PRAGMA user_version, um Schema-Versionen zu tracken und sauber zu erweitern.
 */

export interface Migration {
  version: number
  description: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema (folders, messages, threads, attachments, audit log, sync state)',
    sql: `
      CREATE TABLE IF NOT EXISTS folders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id      TEXT NOT NULL,
        remote_id       TEXT NOT NULL,
        name            TEXT NOT NULL,
        parent_remote_id TEXT,
        path            TEXT,
        well_known      TEXT,
        is_favorite     INTEGER NOT NULL DEFAULT 0,
        unread_count    INTEGER NOT NULL DEFAULT 0,
        total_count     INTEGER NOT NULL DEFAULT 0,
        last_synced_at  TEXT,
        UNIQUE(account_id, remote_id)
      );
      CREATE INDEX IF NOT EXISTS idx_folders_account ON folders(account_id);

      CREATE TABLE IF NOT EXISTS threads (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id           TEXT NOT NULL,
        remote_thread_id     TEXT NOT NULL,
        subject_normalized   TEXT,
        last_message_at      TEXT,
        message_count        INTEGER NOT NULL DEFAULT 0,
        UNIQUE(account_id, remote_thread_id)
      );
      CREATE INDEX IF NOT EXISTS idx_threads_last_msg ON threads(last_message_at);

      CREATE TABLE IF NOT EXISTS messages (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id               TEXT NOT NULL,
        folder_id                INTEGER REFERENCES folders(id) ON DELETE SET NULL,
        thread_id                INTEGER REFERENCES threads(id) ON DELETE SET NULL,
        remote_id                TEXT NOT NULL,
        remote_thread_id         TEXT,
        subject                  TEXT,
        from_addr                TEXT,
        from_name                TEXT,
        to_addrs                 TEXT,
        cc_addrs                 TEXT,
        bcc_addrs                TEXT,
        sent_at                  TEXT,
        received_at              TEXT,
        snippet                  TEXT,
        body_html                TEXT,
        body_text                TEXT,
        is_read                  INTEGER NOT NULL DEFAULT 0,
        is_flagged               INTEGER NOT NULL DEFAULT 0,
        has_attachments          INTEGER NOT NULL DEFAULT 0,
        importance               TEXT,
        list_unsubscribe         TEXT,
        list_unsubscribe_post    TEXT,
        snoozed_until            TEXT,
        snoozed_from_folder_id   INTEGER,
        waiting_for_reply_until  TEXT,
        ai_summary               TEXT,
        ai_labels_json           TEXT,
        ai_triage_score          REAL,
        change_key               TEXT,
        last_synced_at           TEXT,
        UNIQUE(account_id, remote_id)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_folder    ON messages(folder_id);
      CREATE INDEX IF NOT EXISTS idx_messages_thread    ON messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_received  ON messages(received_at);
      CREATE INDEX IF NOT EXISTS idx_messages_account   ON messages(account_id);

      CREATE TABLE IF NOT EXISTS attachments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id      INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        remote_id       TEXT,
        name            TEXT NOT NULL,
        mime            TEXT,
        size            INTEGER,
        content_id      TEXT,
        local_path      TEXT,
        is_inline       INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

      CREATE TABLE IF NOT EXISTS message_actions (
        id                        INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id                INTEGER REFERENCES messages(id) ON DELETE SET NULL,
        account_id                TEXT,
        action_type               TEXT NOT NULL,
        payload_json              TEXT,
        performed_at              TEXT NOT NULL,
        performed_by_account_id   TEXT,
        source                    TEXT NOT NULL,
        undone                    INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_actions_message ON message_actions(message_id);
      CREATE INDEX IF NOT EXISTS idx_actions_when    ON message_actions(performed_at);

      CREATE TABLE IF NOT EXISTS sync_state (
        account_id      TEXT NOT NULL,
        folder_id       INTEGER,
        delta_token     TEXT,
        last_synced_at  TEXT,
        PRIMARY KEY (account_id, folder_id)
      );
    `
  },
  {
    version: 2,
    description: 'Full-text search for messages',
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        subject,
        from_addr,
        from_name,
        body_text,
        content='messages',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts (rowid, subject, from_addr, from_name, body_text)
        VALUES (new.id, new.subject, new.from_addr, new.from_name, new.body_text);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts (messages_fts, rowid, subject, from_addr, from_name, body_text)
        VALUES('delete', old.id, old.subject, old.from_addr, old.from_name, old.body_text);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts (messages_fts, rowid, subject, from_addr, from_name, body_text)
        VALUES('delete', old.id, old.subject, old.from_addr, old.from_name, old.body_text);
        INSERT INTO messages_fts (rowid, subject, from_addr, from_name, body_text)
        VALUES (new.id, new.subject, new.from_addr, new.from_name, new.body_text);
      END;
    `
  },
  {
    version: 3,
    description: 'MVP 2 schema: todos, templates, quicksteps + workflow indizes',
    sql: `
      -- ToDo-Buckets (Heute / Morgen / Diese Woche / Spaeter / Erledigt).
      -- Jede ToDo verweist auf eine Mail. Eine Mail kann max. eine
      -- aktive ToDo haben (UNIQUE auf message_id + status='open').
      CREATE TABLE IF NOT EXISTS todos (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id    INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        account_id    TEXT NOT NULL,
        due_kind      TEXT NOT NULL,
        due_at        TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'open',
        notes         TEXT,
        created_at    TEXT NOT NULL,
        completed_at  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_todos_status_due ON todos(status, due_at);
      CREATE INDEX IF NOT EXISTS idx_todos_message    ON todos(message_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_open_per_message
        ON todos(message_id) WHERE status = 'open';

      -- Textbausteine fuer den Compose. Variablen werden zur Laufzeit
      -- substituiert (z.B. {{vorname}} -> "Kurt").
      CREATE TABLE IF NOT EXISTS templates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        body_html     TEXT NOT NULL,
        body_text     TEXT,
        variables_json TEXT,
        shortcut      TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_templates_sort ON templates(sort_order);

      -- QuickSteps: JSON-Aktions-Sequenzen mit Shortcut.
      -- actions_json: [{ "type": "move", "folderRemoteId": "..." }, ...]
      CREATE TABLE IF NOT EXISTS quicksteps (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        icon          TEXT,
        shortcut      TEXT,
        actions_json  TEXT NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        enabled       INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_quicksteps_sort ON quicksteps(sort_order);

      -- Background-Ticks brauchen schnellen Zugriff auf "weckbare" Mails.
      CREATE INDEX IF NOT EXISTS idx_messages_snoozed_until
        ON messages(snoozed_until) WHERE snoozed_until IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_messages_waiting_until
        ON messages(waiting_for_reply_until) WHERE waiting_for_reply_until IS NOT NULL;
    `
  },
  {
    version: 4,
    description: 'MVP 2: Standard-Vorlagen fuer Compose',
    sql: `
      INSERT OR IGNORE INTO templates (id, name, body_html, body_text, variables_json, shortcut, sort_order, created_at, updated_at)
      VALUES
        (1, 'Freundliche Anrede',
         '<p>Mit freundlichen Gruessen,</p><p></p>',
         'Mit freundlichen Gruessen,\n\n',
         NULL, NULL, 0, datetime('now'), datetime('now')),
        (2, 'Terminvorschlag',
         '<p>Koennen wir einen kurzen Termin abstimmen?</p><p></p>',
         'Koennen wir einen kurzen Termin abstimmen?\n\n',
         NULL, NULL, 1, datetime('now'), datetime('now'));
    `
  },
  {
    version: 5,
    description: 'MVP 2: Standard-QuickStep (Gelesen & Archiv)',
    sql: `
      INSERT OR IGNORE INTO quicksteps (id, name, icon, shortcut, actions_json, sort_order, enabled, created_at, updated_at)
      VALUES (
        1,
        'Gelesen & Archiv',
        NULL,
        NULL,
        '[{"type":"markRead"},{"type":"archive"}]',
        0,
        1,
        datetime('now'),
        datetime('now')
      );
    `
  },
  {
    version: 6,
    description: 'MVP 3: Workflow-Boards, VIP-Absender, QuickStep ToDo Heute',
    sql: `
      CREATE TABLE IF NOT EXISTS workflow_boards (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        columns_json  TEXT NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_boards_sort ON workflow_boards(sort_order);

      CREATE TABLE IF NOT EXISTS vip_senders (
        account_id   TEXT NOT NULL,
        email_lower    TEXT NOT NULL,
        PRIMARY KEY (account_id, email_lower)
      );

      INSERT OR IGNORE INTO quicksteps (id, name, icon, shortcut, actions_json, sort_order, enabled, created_at, updated_at)
      VALUES (
        2,
        'ToDo Heute',
        NULL,
        NULL,
        '[{"type":"addTodo","dueKind":"today"}]',
        1,
        1,
        datetime('now'),
        datetime('now')
      );

      INSERT OR IGNORE INTO workflow_boards (id, name, columns_json, sort_order, created_at, updated_at)
      VALUES (
        1,
        'Standard',
        '[{"id":"inbox","title":"Posteingang","quickStepId":null},{"id":"done","title":"Erledigt (Archiv)","quickStepId":1},{"id":"today","title":"ToDo Heute","quickStepId":2}]',
        0,
        datetime('now'),
        datetime('now')
      );
    `
  },
  {
    version: 7,
    description: 'Mail-Regeln: Definitionen, Ausfuehrungs-Log, Tags, List-Id, Audit rule_id',
    sql: `
      ALTER TABLE messages ADD COLUMN list_id TEXT;

      CREATE TABLE IF NOT EXISTS mail_rules (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        enabled         INTEGER NOT NULL DEFAULT 0,
        trigger         TEXT NOT NULL DEFAULT 'manual',
        sort_order      INTEGER NOT NULL DEFAULT 0,
        definition_json TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mail_rules_sort ON mail_rules(sort_order, id);

      CREATE TABLE IF NOT EXISTS mail_rule_executions (
        rule_id     INTEGER NOT NULL REFERENCES mail_rules(id) ON DELETE CASCADE,
        message_id  INTEGER NOT NULL,
        executed_at TEXT NOT NULL,
        PRIMARY KEY (rule_id, message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rule_exec_message ON mail_rule_executions(message_id);

      CREATE TABLE IF NOT EXISTS message_tags (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        account_id  TEXT NOT NULL,
        tag         TEXT NOT NULL,
        UNIQUE(message_id, tag)
      );
      CREATE INDEX IF NOT EXISTS idx_message_tags_msg ON message_tags(message_id);

      ALTER TABLE message_actions ADD COLUMN rule_id INTEGER REFERENCES mail_rules(id) ON DELETE SET NULL;
    `
  },
  {
    version: 8,
    description: 'Workflow: QuickSteps und Spalten fuer ToDo Morgen/Woche/Spaeter',
    sql: `
      INSERT OR IGNORE INTO quicksteps (id, name, icon, shortcut, actions_json, sort_order, enabled, created_at, updated_at)
      VALUES
        (3, 'ToDo Morgen', NULL, NULL, '[{"type":"addTodo","dueKind":"tomorrow"}]', 2, 1, datetime('now'), datetime('now')),
        (4, 'ToDo Diese Woche', NULL, NULL, '[{"type":"addTodo","dueKind":"this_week"}]', 3, 1, datetime('now'), datetime('now')),
        (5, 'ToDo Spaeter', NULL, NULL, '[{"type":"addTodo","dueKind":"later"}]', 4, 1, datetime('now'), datetime('now'));

      UPDATE workflow_boards
      SET columns_json = '[{"id":"inbox","title":"Posteingang","quickStepId":null},{"id":"today","title":"ToDo Heute","quickStepId":2,"todoDueKind":"today"},{"id":"tomorrow","title":"ToDo Morgen","quickStepId":3,"todoDueKind":"tomorrow"},{"id":"week","title":"ToDo Diese Woche","quickStepId":4,"todoDueKind":"this_week"},{"id":"later","title":"ToDo Spaeter","quickStepId":5,"todoDueKind":"later"},{"id":"done","title":"Erledigt (Archiv)","quickStepId":1}]',
          updated_at = datetime('now')
      WHERE id = 1
        AND (SELECT COUNT(*) FROM json_each(columns_json)) = 3;
    `
  },
  {
    version: 9,
    description: 'Workflow: Ueberfaellig-Spalte (ToDo nach Fälligkeit)',
    sql: `
      UPDATE workflow_boards
      SET columns_json = '[{"id":"inbox","title":"Posteingang","quickStepId":null},{"id":"overdue","title":"Ueberfaellig","quickStepId":null,"todoDueKind":"overdue"},{"id":"today","title":"ToDo Heute","quickStepId":2,"todoDueKind":"today"},{"id":"tomorrow","title":"ToDo Morgen","quickStepId":3,"todoDueKind":"tomorrow"},{"id":"week","title":"ToDo Diese Woche","quickStepId":4,"todoDueKind":"this_week"},{"id":"later","title":"ToDo Spaeter","quickStepId":5,"todoDueKind":"later"},{"id":"done","title":"Erledigt (Archiv)","quickStepId":1}]',
          updated_at = datetime('now')
      WHERE id = 1
        AND (SELECT COUNT(*) FROM json_each(columns_json)) = 6
        AND instr(columns_json, '"id":"overdue"') = 0;
    `
  },
  {
    version: 10,
    description: 'Mail-ToDos: optionaler Kalender-Termin (Start/Ende ISO)',
    sql: `
      ALTER TABLE todos ADD COLUMN todo_start_at TEXT;
      ALTER TABLE todos ADD COLUMN todo_end_at TEXT;
    `
  },
  {
    version: 11,
    description: 'Triage: pro Konto Zielordner In Bearbeitung / Erledigt (Remote-IDs)',
    sql: `
      CREATE TABLE IF NOT EXISTS account_workflow_mail_folders (
        account_id TEXT PRIMARY KEY,
        wip_folder_remote_id TEXT,
        done_folder_remote_id TEXT
      );
    `
  },
  {
    version: 12,
    description: 'Meta-Ordner (app-weite Such-/Filteransichten ueber alle Konten)',
    sql: `
      CREATE TABLE IF NOT EXISTS meta_folders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        criteria_json   TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_meta_folders_sort ON meta_folders(sort_order, id);
    `
  },
  {
    version: 13,
    description: 'Notizen fuer Mails, Kalendertermine und freie Notizen',
    sql: `
      CREATE TABLE IF NOT EXISTS user_notes (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        kind                     TEXT NOT NULL CHECK (kind IN ('mail', 'calendar', 'standalone')),
        message_id               INTEGER NULL REFERENCES messages(id) ON DELETE CASCADE,
        account_id               TEXT,
        calendar_source          TEXT CHECK (calendar_source IS NULL OR calendar_source IN ('microsoft', 'google')),
        calendar_remote_id       TEXT,
        event_remote_id          TEXT,
        title                    TEXT NULL,
        body                     TEXT NOT NULL DEFAULT '',
        created_at               TEXT NOT NULL,
        updated_at               TEXT NOT NULL,
        event_title_snapshot     TEXT NULL,
        event_start_iso_snapshot TEXT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notes_mail_unique
        ON user_notes(message_id)
        WHERE kind = 'mail';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notes_calendar_unique
        ON user_notes(account_id, calendar_source, calendar_remote_id, event_remote_id)
        WHERE kind = 'calendar';

      CREATE INDEX IF NOT EXISTS idx_user_notes_updated_at
        ON user_notes(updated_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_user_notes_kind_updated
        ON user_notes(kind, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_notes_account_updated
        ON user_notes(account_id, updated_at DESC)
        WHERE account_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_user_notes_message
        ON user_notes(message_id)
        WHERE message_id IS NOT NULL;
    `
  },
  {
    version: 14,
    description: 'People/Kontakte: lokaler Cache und Sync-Zustand',
    sql: `
      CREATE TABLE IF NOT EXISTS people_contacts (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id          TEXT NOT NULL,
        provider            TEXT NOT NULL CHECK (provider IN ('microsoft','google')),
        remote_id           TEXT NOT NULL,
        change_key          TEXT,
        display_name        TEXT,
        given_name          TEXT,
        surname             TEXT,
        company             TEXT,
        job_title           TEXT,
        primary_email       TEXT,
        emails_json         TEXT,
        phones_json         TEXT,
        addresses_json      TEXT,
        categories_json     TEXT,
        notes                 TEXT,
        photo_local_path      TEXT,
        raw_json              TEXT,
        updated_remote        TEXT,
        updated_local         TEXT NOT NULL DEFAULT (datetime('now')),
        is_favorite           INTEGER NOT NULL DEFAULT 0,
        UNIQUE(account_id, provider, remote_id)
      );
      CREATE INDEX IF NOT EXISTS idx_people_contacts_account
        ON people_contacts(account_id, provider);
      CREATE INDEX IF NOT EXISTS idx_people_contacts_display
        ON people_contacts(display_name);

      CREATE TABLE IF NOT EXISTS people_sync_state (
        account_id      TEXT PRIMARY KEY,
        provider        TEXT NOT NULL CHECK (provider IN ('microsoft','google')),
        sync_cursor     TEXT,
        last_synced_at  TEXT
      );
    `
  },
  {
    version: 15,
    description: 'People: Zusatzfelder (Abteilung, Standort, Geburtstag, Web) fuer Kontakte',
    sql: `
      ALTER TABLE people_contacts ADD COLUMN department TEXT;
      ALTER TABLE people_contacts ADD COLUMN office_location TEXT;
      ALTER TABLE people_contacts ADD COLUMN birthday_iso TEXT;
      ALTER TABLE people_contacts ADD COLUMN web_page TEXT;
    `
  },
  {
    version: 16,
    description: 'Geplanter Mailversand: lokale Warteschlange (Compose-Payload als JSON)',
    sql: `
      CREATE TABLE IF NOT EXISTS compose_scheduled (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        payload_json   TEXT NOT NULL,
        send_at_iso    TEXT NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
        attempts       INTEGER NOT NULL DEFAULT 0,
        last_error     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_compose_scheduled_pending
        ON compose_scheduled(send_at_iso) WHERE status = 'pending';
    `
  },
  {
    version: 17,
    description: 'Cloud-Aufgaben: lokale Planungszeit (Kalender-Blöcke)',
    sql: `
      CREATE TABLE IF NOT EXISTS task_planned_schedule (
        task_key          TEXT PRIMARY KEY,
        planned_start_iso TEXT NOT NULL,
        planned_end_iso   TEXT NOT NULL,
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_task_planned_schedule_start
        ON task_planned_schedule(planned_start_iso);
    `
  },
  {
    version: 18,
    description: 'Mail ↔ Cloud-Aufgabe Verknüpfung (Variante C, 1:n)',
    sql: `
      CREATE TABLE IF NOT EXISTS mail_cloud_task_link (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id   INTEGER NOT NULL,
        account_id   TEXT NOT NULL,
        list_id      TEXT NOT NULL,
        task_id      TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(message_id, account_id, list_id, task_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mail_cloud_task_link_message
        ON mail_cloud_task_link(message_id);
      CREATE INDEX IF NOT EXISTS idx_mail_cloud_task_link_task
        ON mail_cloud_task_link(account_id, list_id, task_id);
    `
  },
  {
    version: 19,
    description: 'Kalender-Termine: lokaler Cache und Sync-Fenster pro Konto',
    sql: `
      CREATE TABLE IF NOT EXISTS calendar_events (
        id                    TEXT PRIMARY KEY,
        account_id            TEXT NOT NULL,
        source                TEXT NOT NULL CHECK (source IN ('microsoft','google')),
        graph_event_id        TEXT NOT NULL,
        graph_calendar_id     TEXT,
        account_email         TEXT NOT NULL,
        account_color_class   TEXT NOT NULL,
        title                 TEXT NOT NULL,
        start_iso             TEXT NOT NULL,
        end_iso               TEXT NOT NULL,
        is_all_day            INTEGER NOT NULL DEFAULT 0,
        location              TEXT,
        web_link              TEXT,
        join_url              TEXT,
        organizer             TEXT,
        categories_json       TEXT,
        display_color_hex     TEXT,
        calendar_can_edit     INTEGER,
        synced_at             TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(account_id, source, graph_event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_events_range
        ON calendar_events(start_iso, end_iso);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_account
        ON calendar_events(account_id);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar
        ON calendar_events(account_id, graph_calendar_id);

      CREATE TABLE IF NOT EXISTS calendar_sync_state (
        account_id        TEXT PRIMARY KEY,
        window_start_iso  TEXT NOT NULL,
        window_end_iso    TEXT NOT NULL,
        last_synced_at    TEXT NOT NULL
      );
    `
  },
  {
    version: 20,
    description: 'Cloud-Aufgaben (MS To Do / Google Tasks): Listen + Aufgaben lokal',
    sql: `
      CREATE TABLE IF NOT EXISTS task_lists (
        account_id    TEXT NOT NULL,
        list_id       TEXT NOT NULL,
        name          TEXT NOT NULL,
        is_default    INTEGER NOT NULL DEFAULT 0,
        provider      TEXT NOT NULL CHECK (provider IN ('microsoft','google')),
        synced_at     TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, list_id)
      );
      CREATE INDEX IF NOT EXISTS idx_task_lists_account
        ON task_lists(account_id);

      CREATE TABLE IF NOT EXISTS cloud_tasks (
        account_id    TEXT NOT NULL,
        list_id       TEXT NOT NULL,
        task_id       TEXT NOT NULL,
        title         TEXT NOT NULL,
        completed     INTEGER NOT NULL DEFAULT 0,
        due_iso       TEXT,
        notes         TEXT,
        synced_at     TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, list_id, task_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cloud_tasks_account_list
        ON cloud_tasks(account_id, list_id);

      CREATE TABLE IF NOT EXISTS task_lists_sync_state (
        account_id      TEXT PRIMARY KEY,
        last_synced_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_list_sync_state (
        account_id      TEXT NOT NULL,
        list_id         TEXT NOT NULL,
        last_synced_at  TEXT NOT NULL,
        PRIMARY KEY (account_id, list_id)
      );
    `
  },
  {
    version: 21,
    description: 'Kalender-Ordner, Termin-Details, Outlook-Masterkategorien (lokal)',
    sql: `
      CREATE TABLE IF NOT EXISTS calendar_folders (
        account_id         TEXT NOT NULL,
        calendar_id        TEXT NOT NULL,
        name               TEXT NOT NULL,
        is_default         INTEGER NOT NULL DEFAULT 0,
        color              TEXT,
        hex_color          TEXT,
        can_edit           INTEGER,
        provider           TEXT NOT NULL CHECK (provider IN ('microsoft','google')),
        access_role        TEXT,
        calendar_kind      TEXT NOT NULL DEFAULT 'standard'
                           CHECK (calendar_kind IN ('standard','m365Group')),
        group_sort_index   INTEGER,
        synced_at          TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, calendar_id)
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_folders_account
        ON calendar_folders(account_id, calendar_kind, group_sort_index);

      CREATE TABLE IF NOT EXISTS calendar_folders_sync_state (
        account_id           TEXT PRIMARY KEY,
        last_synced_at       TEXT NOT NULL,
        m365_groups_total    INTEGER
      );

      CREATE TABLE IF NOT EXISTS master_categories (
        account_id     TEXT NOT NULL,
        category_id    TEXT NOT NULL,
        display_name   TEXT NOT NULL,
        color          TEXT NOT NULL,
        synced_at      TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, category_id)
      );

      CREATE TABLE IF NOT EXISTS master_categories_sync_state (
        account_id      TEXT PRIMARY KEY,
        last_synced_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calendar_event_details (
        account_id            TEXT NOT NULL,
        graph_event_id        TEXT NOT NULL,
        graph_calendar_id     TEXT,
        subject               TEXT,
        attendee_emails_json  TEXT NOT NULL DEFAULT '[]',
        join_url              TEXT,
        is_online_meeting     INTEGER NOT NULL DEFAULT 0,
        synced_at             TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, graph_event_id)
      );
    `
  },
  {
    version: 22,
    description: 'Graph follow-up flag status (flagged|complete|notFlagged) auf messages',
    sql: `
      ALTER TABLE messages ADD COLUMN follow_up_flag_status TEXT;
      UPDATE messages
      SET follow_up_flag_status = CASE WHEN is_flagged = 1 THEN 'flagged' ELSE NULL END;
    `
  },
  {
    version: 23,
    description: 'Kalender-Termin-Details: HTML-Beschreibung (body_html) cachen',
    sql: `
      ALTER TABLE calendar_event_details ADD COLUMN body_html TEXT;
    `
  },
  {
    version: 24,
    description: 'Kalender-Termine: lokales Anzeige-Icon (icon_id)',
    sql: `
      ALTER TABLE calendar_events ADD COLUMN icon_id TEXT;
    `
  },
  {
    version: 25,
    description: 'Kalender-Ordner: lokale Anzeigefarbe (z. B. abonnierte Kalender)',
    sql: `
      ALTER TABLE calendar_folders ADD COLUMN display_color_override_hex TEXT;
    `
  },
  {
    version: 26,
    description: 'Notizen: Kalenderplanung, Sektionen und Verknuepfungen',
    sql: `
      CREATE TABLE IF NOT EXISTS note_sections (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        icon       TEXT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ALTER TABLE user_notes ADD COLUMN scheduled_start_iso TEXT;
      ALTER TABLE user_notes ADD COLUMN scheduled_end_iso TEXT;
      ALTER TABLE user_notes ADD COLUMN scheduled_all_day INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_notes ADD COLUMN section_id INTEGER NULL REFERENCES note_sections(id) ON DELETE SET NULL;
      ALTER TABLE user_notes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS user_note_links (
        from_note_id INTEGER NOT NULL REFERENCES user_notes(id) ON DELETE CASCADE,
        to_note_id   INTEGER NOT NULL REFERENCES user_notes(id) ON DELETE CASCADE,
        created_at   TEXT NOT NULL,
        PRIMARY KEY (from_note_id, to_note_id),
        CHECK (from_note_id != to_note_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_notes_scheduled_start
        ON user_notes(scheduled_start_iso)
        WHERE scheduled_start_iso IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_user_notes_section_sort
        ON user_notes(section_id, sort_order, id);
    `
  },
  {
    version: 27,
    description: 'Notizen-Sektionen: Untersektionen (parent_id)',
    sql: `
      ALTER TABLE note_sections ADD COLUMN parent_id INTEGER NULL
        REFERENCES note_sections(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_note_sections_parent_sort
        ON note_sections(parent_id, sort_order, id);
    `
  },
  {
    version: 28,
    description: 'Notizen-Sektionen: Icon-Farbe (icon_color)',
    sql: `
      ALTER TABLE note_sections ADD COLUMN icon_color TEXT NULL;
    `
  },
  {
    version: 29,
    description: 'Cloud-Aufgaben: lokales Anzeige-Icon und Farbe',
    sql: `
      ALTER TABLE cloud_tasks ADD COLUMN icon_id TEXT NULL;
      ALTER TABLE cloud_tasks ADD COLUMN icon_color TEXT NULL;
    `
  },
  {
    version: 30,
    description: 'Notizen: polymorphe Objekt-Verknuepfungen',
    sql: `
      CREATE TABLE IF NOT EXISTS user_note_entity_links (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        from_note_id            INTEGER NOT NULL REFERENCES user_notes(id) ON DELETE CASCADE,
        target_kind             TEXT NOT NULL,
        to_note_id              INTEGER NULL REFERENCES user_notes(id) ON DELETE CASCADE,
        mail_message_id         INTEGER NULL,
        calendar_account_id     TEXT NULL,
        calendar_graph_event_id TEXT NULL,
        task_account_id         TEXT NULL,
        task_list_id            TEXT NULL,
        task_id                 TEXT NULL,
        created_at              TEXT NOT NULL,
        CHECK (
          (target_kind = 'note' AND to_note_id IS NOT NULL
            AND mail_message_id IS NULL AND calendar_account_id IS NULL
            AND calendar_graph_event_id IS NULL AND task_account_id IS NULL
            AND task_list_id IS NULL AND task_id IS NULL)
          OR (target_kind = 'mail' AND mail_message_id IS NOT NULL
            AND to_note_id IS NULL AND calendar_account_id IS NULL
            AND calendar_graph_event_id IS NULL AND task_account_id IS NULL
            AND task_list_id IS NULL AND task_id IS NULL)
          OR (target_kind = 'calendar_event'
            AND calendar_account_id IS NOT NULL AND calendar_graph_event_id IS NOT NULL
            AND to_note_id IS NULL AND mail_message_id IS NULL
            AND task_account_id IS NULL AND task_list_id IS NULL AND task_id IS NULL)
          OR (target_kind = 'cloud_task'
            AND task_account_id IS NOT NULL AND task_list_id IS NOT NULL AND task_id IS NOT NULL
            AND to_note_id IS NULL AND mail_message_id IS NULL
            AND calendar_account_id IS NULL AND calendar_graph_event_id IS NULL)
        ),
        CHECK (target_kind != 'note' OR from_note_id != to_note_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_unq_note_entity_link_note
        ON user_note_entity_links(from_note_id, to_note_id)
        WHERE target_kind = 'note';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unq_note_entity_link_mail
        ON user_note_entity_links(from_note_id, mail_message_id)
        WHERE target_kind = 'mail';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unq_note_entity_link_calendar
        ON user_note_entity_links(from_note_id, calendar_account_id, calendar_graph_event_id)
        WHERE target_kind = 'calendar_event';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unq_note_entity_link_task
        ON user_note_entity_links(from_note_id, task_account_id, task_list_id, task_id)
        WHERE target_kind = 'cloud_task';

      CREATE INDEX IF NOT EXISTS idx_note_entity_links_from
        ON user_note_entity_links(from_note_id);
      CREATE INDEX IF NOT EXISTS idx_note_entity_links_to_note
        ON user_note_entity_links(to_note_id)
        WHERE target_kind = 'note';

      INSERT INTO user_note_entity_links (from_note_id, target_kind, to_note_id, created_at)
      SELECT from_note_id, 'note', to_note_id, created_at FROM user_note_links;
    `
  },
  {
    version: 31,
    description: 'Notizen: lokales Anzeige-Icon und Farbe pro Seite',
    sql: `
      ALTER TABLE user_notes ADD COLUMN icon_id TEXT NULL;
      ALTER TABLE user_notes ADD COLUMN icon_color TEXT NULL;
    `
  },
  {
    version: 32,
    description: 'Notizen: lokale Dateien und OneDrive/SharePoint-Anhaenge',
    sql: `
      CREATE TABLE IF NOT EXISTS user_note_attachments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id         INTEGER NOT NULL REFERENCES user_notes(id) ON DELETE CASCADE,
        kind            TEXT NOT NULL CHECK (kind IN ('local', 'cloud')),
        name            TEXT NOT NULL,
        content_type    TEXT,
        size            INTEGER,
        local_path      TEXT,
        source_url      TEXT,
        provider_type   TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_note_attachments_note
        ON user_note_attachments(note_id, created_at, id);
    `
  },
  {
    version: 33,
    description: 'Notizen: FTS5-Volltextsuche',
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS user_notes_fts USING fts5(
        title,
        body,
        event_title,
        mail_subject,
        tokenize='unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS user_notes_fts_ai AFTER INSERT ON user_notes BEGIN
        INSERT INTO user_notes_fts(rowid, title, body, event_title, mail_subject)
        VALUES (
          new.id,
          COALESCE(new.title, ''),
          COALESCE(new.body, ''),
          COALESCE(new.event_title_snapshot, ''),
          COALESCE((SELECT subject FROM messages WHERE id = new.message_id), '')
        );
      END;

      CREATE TRIGGER IF NOT EXISTS user_notes_fts_ad AFTER DELETE ON user_notes BEGIN
        DELETE FROM user_notes_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS user_notes_fts_au AFTER UPDATE ON user_notes BEGIN
        DELETE FROM user_notes_fts WHERE rowid = old.id;
        INSERT INTO user_notes_fts(rowid, title, body, event_title, mail_subject)
        VALUES (
          new.id,
          COALESCE(new.title, ''),
          COALESCE(new.body, ''),
          COALESCE(new.event_title_snapshot, ''),
          COALESCE((SELECT subject FROM messages WHERE id = new.message_id), '')
        );
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au_user_notes_fts
      AFTER UPDATE OF subject ON messages
      WHEN old.subject IS NOT new.subject BEGIN
        DELETE FROM user_notes_fts
        WHERE rowid IN (SELECT id FROM user_notes WHERE message_id = new.id);
        INSERT INTO user_notes_fts(rowid, title, body, event_title, mail_subject)
        SELECT
          n.id,
          COALESCE(n.title, ''),
          COALESCE(n.body, ''),
          COALESCE(n.event_title_snapshot, ''),
          COALESCE(new.subject, '')
        FROM user_notes n
        WHERE n.message_id = new.id;
      END;

      INSERT INTO user_notes_fts(rowid, title, body, event_title, mail_subject)
      SELECT
        n.id,
        COALESCE(n.title, ''),
        COALESCE(n.body, ''),
        COALESCE(n.event_title_snapshot, ''),
        COALESCE(m.subject, '')
      FROM user_notes n
      LEFT JOIN messages m ON m.id = n.message_id;
    `
  },
  {
    version: 34,
    description: 'Notizen-FTS: Update/Delete-Trigger reparieren',
    sql: `
      DROP TRIGGER IF EXISTS user_notes_fts_ad;
      DROP TRIGGER IF EXISTS user_notes_fts_au;
      DROP TRIGGER IF EXISTS messages_au_user_notes_fts;

      CREATE TRIGGER user_notes_fts_ad AFTER DELETE ON user_notes BEGIN
        DELETE FROM user_notes_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER user_notes_fts_au AFTER UPDATE ON user_notes BEGIN
        DELETE FROM user_notes_fts WHERE rowid = old.id;
        INSERT INTO user_notes_fts(rowid, title, body, event_title, mail_subject)
        VALUES (
          new.id,
          COALESCE(new.title, ''),
          COALESCE(new.body, ''),
          COALESCE(new.event_title_snapshot, ''),
          COALESCE((SELECT subject FROM messages WHERE id = new.message_id), '')
        );
      END;

      CREATE TRIGGER messages_au_user_notes_fts
      AFTER UPDATE OF subject ON messages
      WHEN old.subject IS NOT new.subject BEGIN
        DELETE FROM user_notes_fts
        WHERE rowid IN (SELECT id FROM user_notes WHERE message_id = new.id);
        INSERT INTO user_notes_fts(rowid, title, body, event_title, mail_subject)
        SELECT
          n.id,
          COALESCE(n.title, ''),
          COALESCE(n.body, ''),
          COALESCE(n.event_title_snapshot, ''),
          COALESCE(new.subject, '')
        FROM user_notes n
        WHERE n.message_id = new.id;
      END;
    `
  },
  {
    version: 35,
    description: 'Composite-Indizes fuer Mail-Listen und Thread-Lookups',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_messages_folder_received
        ON messages(folder_id, received_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_account_thread
        ON messages(account_id, remote_thread_id);
      CREATE INDEX IF NOT EXISTS idx_folders_well_known_account
        ON folders(well_known, account_id);
    `
  },
  {
    version: 36,
    description: 'FTS messages_au nur bei Such-relevanten Spalten',
    sql: `
      DROP TRIGGER IF EXISTS messages_au;
      CREATE TRIGGER messages_au AFTER UPDATE OF subject, from_addr, from_name, body_text ON messages BEGIN
        INSERT INTO messages_fts (messages_fts, rowid, subject, from_addr, from_name, body_text)
        VALUES('delete', old.id, old.subject, old.from_addr, old.from_name, old.body_text);
        INSERT INTO messages_fts (rowid, subject, from_addr, from_name, body_text)
        VALUES (new.id, new.subject, new.from_addr, new.from_name, new.body_text);
      END;
    `
  }
]
