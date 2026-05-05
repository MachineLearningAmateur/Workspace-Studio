import {
  categories,
  interviewRelevanceValues,
  itemTypes,
  labelFor,
  statuses
} from "../types/tracker";

interface TrackerFiltersProps {
  categoryFilter: string;
  statusFilter: string;
  itemTypeFilter: string;
  relevanceFilter: string;
  dateFilter: string;
  searchText: string;
  onCategoryFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onItemTypeFilterChange: (value: string) => void;
  onRelevanceFilterChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onSearchTextChange: (value: string) => void;
}

export function TrackerFilters({
  categoryFilter,
  statusFilter,
  itemTypeFilter,
  relevanceFilter,
  dateFilter,
  searchText,
  onCategoryFilterChange,
  onStatusFilterChange,
  onItemTypeFilterChange,
  onRelevanceFilterChange,
  onDateFilterChange,
  onSearchTextChange
}: TrackerFiltersProps) {
  return (
    <section className="filters" aria-label="Tracker filters">
      <label>
        Category
        <select value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option value={category} key={category}>
              {labelFor(category)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Status
        <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option value={status} key={status}>
              {labelFor(status)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Type
        <select value={itemTypeFilter} onChange={(event) => onItemTypeFilterChange(event.target.value)}>
          <option value="">All types</option>
          {itemTypes.map((itemType) => (
            <option value={itemType} key={itemType}>
              {labelFor(itemType)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Relevance
        <select value={relevanceFilter} onChange={(event) => onRelevanceFilterChange(event.target.value)}>
          <option value="">All relevance</option>
          {interviewRelevanceValues.map((relevance) => (
            <option value={relevance} key={relevance}>
              {labelFor(relevance)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Date
        <input type="date" value={dateFilter} onChange={(event) => onDateFilterChange(event.target.value)} />
      </label>

      <label className="search-field">
        Search
        <input
          type="search"
          placeholder="Item, pattern, source, notes"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
        />
      </label>
    </section>
  );
}
