import { useEffect, useMemo, useState } from "react";
import { addActivityRow, getActivityRows, updateActivityRow } from "./api/trackerApi";
import { ActivityForm } from "./components/ActivityForm";
import { ActivityList } from "./components/ActivityList";
import { EditRowModal } from "./components/EditRowModal";
import { SummaryCards } from "./components/SummaryCards";
import { TrackerFilters } from "./components/TrackerFilters";
import type { ActivityInput, ActivityRow } from "./types/tracker";
import { emptyActivityInput } from "./types/tracker";

function App() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [draft, setDraft] = useState<ActivityInput>(emptyActivityInput);
  const [editDraft, setEditDraft] = useState<ActivityInput>(emptyActivityInput);
  const [editingRow, setEditingRow] = useState<ActivityRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState("");
  const [relevanceFilter, setRelevanceFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [searchText, setSearchText] = useState("");

  async function loadRows() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await getActivityRows();
      setRows(sortRows(data));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load tracker");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesCategory = categoryFilter ? row.category === categoryFilter : true;
      const matchesStatus = statusFilter ? row.status === statusFilter : true;
      const matchesItemType = itemTypeFilter ? row.item_type === itemTypeFilter : true;
      const matchesRelevance = relevanceFilter ? row.interview_relevance === relevanceFilter : true;
      const matchesDate = dateFilter ? row.date === dateFilter : true;
      const matchesSearch = normalizedSearch
        ? `${row.item_name} ${row.pattern} ${row.source} ${row.notes}`.toLowerCase().includes(normalizedSearch)
        : true;

      return matchesCategory && matchesStatus && matchesItemType && matchesRelevance && matchesDate && matchesSearch;
    });
  }, [rows, categoryFilter, dateFilter, itemTypeFilter, relevanceFilter, searchText, statusFilter]);

  async function createActivity() {
    setIsSaving(true);
    setFormError(null);

    try {
      const created = await addActivityRow(draft);
      setRows((currentRows) => sortRows([...currentRows, created]));
      setDraft({ ...emptyActivityInput, date: draft.date, scheduled_date: draft.scheduled_date });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add activity");
    } finally {
      setIsSaving(false);
    }
  }

  function openEdit(row: ActivityRow) {
    setEditingRow(row);
    setEditError(null);
    setEditDraft(stripRowIndex(row));
  }

  async function saveEditedActivity() {
    if (!editingRow) {
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const updated = await updateActivityRow(editingRow.row_index, editDraft);
      setRows((currentRows) => sortRows(currentRows.map((row) => (row.row_index === updated.row_index ? updated : row))));
      setEditingRow(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Unable to update activity");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">Normalized CSV tracker</p>
          <h1>Interview Prep Activity Tracker</h1>
          <p className="intro">Add one study activity per row so progress stays easy to analyze later.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void loadRows()}>
          Refresh CSV
        </button>
      </header>

      {loadError ? (
        <section className="alert" role="alert">
          {loadError}
        </section>
      ) : null}

      <SummaryCards rows={rows} />

      <ActivityForm
        title="Add Activity"
        submitLabel="Append activity"
        value={draft}
        error={formError}
        isSaving={isSaving}
        onChange={setDraft}
        onSubmit={() => void createActivity()}
      />

      <TrackerFilters
        categoryFilter={categoryFilter}
        statusFilter={statusFilter}
        itemTypeFilter={itemTypeFilter}
        relevanceFilter={relevanceFilter}
        dateFilter={dateFilter}
        searchText={searchText}
        onCategoryFilterChange={setCategoryFilter}
        onStatusFilterChange={setStatusFilter}
        onItemTypeFilterChange={setItemTypeFilter}
        onRelevanceFilterChange={setRelevanceFilter}
        onDateFilterChange={setDateFilter}
        onSearchTextChange={setSearchText}
      />

      {isLoading ? <p className="loading-state">Loading tracker rows...</p> : <ActivityList rows={filteredRows} onEdit={openEdit} />}

      <EditRowModal
        row={editingRow}
        value={editDraft}
        isSaving={isSaving}
        error={editError}
        onChange={setEditDraft}
        onClose={() => setEditingRow(null)}
        onSave={() => void saveEditedActivity()}
      />
    </main>
  );
}

function sortRows(rows: ActivityRow[]) {
  return [...rows].sort((a, b) => {
    const dateComparison = a.date.localeCompare(b.date);
    return dateComparison || a.row_index - b.row_index;
  });
}

function stripRowIndex(row: ActivityRow): ActivityInput {
  const { row_index: _rowIndex, ...activityInput } = row;
  return activityInput;
}

export default App;
