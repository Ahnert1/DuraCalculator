import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import { lootItems } from './data/itemDataMultiNpc';
import { ExtendedItemData } from './models/ExtendedItemData';
import { handleImageError } from './utils/imageUtils';
import { CATEGORIES } from './enums/Categories';
import { HeaderCollage } from './components/HeaderCollage';
import { MiniHeaderCollage } from './components/MiniHeaderCollage';
import { getCustomItems, deleteCustomItem } from './utils/local-storage';
import placeholderBase64 from './utils/placeholder-base64';
import { ItemCreateModal } from './components/item-create-modal';
import { capitalize } from './utils/helpers';

function App() {
  // State for form fields
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<(ExtendedItemData) | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<(ExtendedItemData)[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  // State for table entries
  const [tableEntries, setTableEntries] = useState<(ExtendedItemData)[]>([]);
  const [isItemNameInputFocused, setIsItemNameInputFocused] = useState(false);
  const [lastUpdatedItemName, setLastUpdatedItemName] = useState<string | null>(null);
  const [isQuantityDecreasing, setIsQuantityDecreasing] = useState(false);
  const [lastTotalValue, setLastTotalValue] = useState<number>(0);
  // Refs for form elements
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const itemNameInputRef = useRef<HTMLInputElement>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const floatingValueIdRef = useRef(0);
  const bottomOfTable = useRef<HTMLDivElement>(null);
  //other state fields
  const [floatingValues, setFloatingValues] = useState<Array<{ id: number; value: number; isPositive: boolean }>>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [customItems, setCustomItems] = useState<ExtendedItemData[]>([])
  const [searchResultsKey, setSearchResultsKey] = useState(0);

  useEffect(() => {
    setCustomItems(getCustomItems())
  }, [])

  useEffect(() => {
    // Always use the latest customItems and lootItems
    let items = [...lootItems, ...customItems];
    if (selectedCategory !== 'All') {
      items = items.filter(item => item.category === selectedCategory);
    }

    const fuse = new Fuse(items, { keys: ['name'], threshold: 0.3 });
    let results: ExtendedItemData[] = [];

    if (searchQuery.trim() === '') {
      results = items.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      results = fuse.search(searchQuery).map(result => result.item);
      // If no match, add a new custom item to the results
      const showCreate = searchQuery.trim() && results.every(r => r.name.toLowerCase() !== searchQuery.trim().toLowerCase());
      if (showCreate) {
        results.push({
          name: capitalize(searchQuery),
          value: 0,
          imageBase64: placeholderBase64,
          category: "New Custom",
          npcNames: ["+ New Custom Item"]
        });
      }
    }
    setSearchResults(results);
  }, [searchQuery, selectedCategory, customItems]);

  // Get filtered and sorted items
  const filteredItems = useMemo(() => {
    let items = [...lootItems, ...customItems];

    // Filter by category if needed
    if (selectedCategory !== 'All') {
      items = items.filter(item => item.category === selectedCategory);
    }

    // Sort alphabetically by name
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedCategory, customItems, searchResults]);

  // Calculate total value of all items
  const totalValue = useMemo(() => {
    const newTotal = tableEntries.reduce((sum, entry) => sum + entry.value, 0);
    if (newTotal !== lastTotalValue) {
      setLastTotalValue(newTotal);
    }
    return newTotal;
  }, [tableEntries, lastTotalValue]);

  const getDisplayValue = (value: number) => {
    if (value >= 1000000) return `${value / 1000000}kk`;
    if (value >= 1000) return `${value / 1000}k`;
    return value;
  }

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Handle search input focus
  const handleSearchFocus = () => {
    setIsItemNameInputFocused(true);
    setShowResults(true);
    if (!searchQuery.trim()) {
      setSearchResults(filteredItems); // Show all items from the category
    } else {
      handleSearchChange({ target: { value: searchQuery } } as React.ChangeEvent<HTMLInputElement>)
    }
  };

  // Handle key press in search input
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If Enter is pressed and we have search results
    if (e.key === 'Enter' && searchQuery.trim() !== '' && searchResults.length > 0 && showResults) {
      e.preventDefault(); // Prevent form submission
      // Select the first item in the results
      handleSelectItem(searchResults[0]);
      // Focus the quantity input after a short delay to ensure state updates
      setTimeout(() => {
        if (quantityInputRef.current) {
          quantityInputRef.current.focus();
          quantityInputRef.current.select();
        }
      }, 10);
    }
  };

  const handleDeleteKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.code === "Delete" && searchResults.length > 0 && searchResults[0].category === CATEGORIES.CUSTOM) {
      const newCustomItems = customItems.filter(item => item.name !== searchResults[0].name)
      setCustomItems(newCustomItems);
      handleDeleteItem(searchResults[0].name ?? '', true);
      handleSearchChange({ target: { value: searchQuery } } as React.ChangeEvent<HTMLInputElement>);
    }
  }

  // Handle key press in quantity input
  const handleQuantityKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && selectedItem) {
      e.preventDefault();
      handleAddItem();
    }
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.trim().slice(0, 30);
    setSearchQuery(query);

    if (query !== selectedItem?.name) {
      setSelectedItem(null);
    }
  };

  // Handle selecting an item from search results
  const handleSelectItem = (item: ExtendedItemData) => {
    if (item.category === "New Custom" && !filteredItems.some(i => i.name.toLowerCase() === item.name.toLowerCase())) {
      setIsCreateModalOpen(true)
      setShowResults(false);
    } else {
      setSelectedItem(item);
      setSearchQuery(item.name);
      setShowResults(false);
      if (quantityInputRef.current) {
        quantityInputRef.current.focus();
        quantityInputRef.current.select();
      }
    }
  };

  // Handle quantity change
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') { setQuantity(null); }
    else {
      // Remove leading zeroes
      const noLeadingZeroes = value.replace(/^0+/, '');
      // If the value is empty or just zeros, set to 0
      const numValue = noLeadingZeroes ? parseInt(noLeadingZeroes, 10) : 0;
      // Ensure the value is between 0 and 9999
      const finalValue = Math.max(0, Math.min(9999, numValue));
      // Update the input's value directly to remove leading zeroes
      e.target.value = finalValue.toString();
      setQuantity(finalValue);
    }
  };

  // Handle category change
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value);
    console.log("TesT")

    // Update search results based on new category
    if (!searchQuery.trim()) {
      // Find filtered items with the new category
      const newCategory = e.target.value;
      let newFilteredItems = [...filteredItems];

      if (newCategory !== 'All') {
        newFilteredItems = newFilteredItems.filter(item => item.category === newCategory);
      }

      // Sort alphabetically and show all matching items
      setSearchResults(
        newFilteredItems
          .sort((a, b) => a.name.localeCompare(b.name))
      );

    } else {
      // Rerun search with current query but new category
      handleSearchChange({ target: { value: searchQuery } } as React.ChangeEvent<HTMLInputElement>);
    }
    requestAnimationFrame(() => {
      itemNameInputRef.current?.focus();
    });
  };

  // Add this new function to handle floating value animations
  const addFloatingValue = (value: number, isPositive: boolean) => {
    const id = floatingValueIdRef.current++;
    setFloatingValues(prev => [...prev, { id, value, isPositive }]);

    // Remove the floating value after animation completes
    setTimeout(() => {
      setFloatingValues(prev => prev.filter(v => v.id !== id));
    }, 1500);
  };

  // Add item to table
  const handleAddItem = () => {
    if (!selectedItem) return;

    const quantityToAdd = quantity ?? 1;
    const existingEntryIndex = tableEntries.findIndex(entry => entry.name === selectedItem.name);
    const valueChange = selectedItem.value * quantityToAdd;

    if (existingEntryIndex !== -1) {
      // Item already exists, update its quantity and value
      const updatedEntries = tableEntries.map((entry, index) => {
        if (index === existingEntryIndex) {
          const newQuantity = (entry.quantity ?? 0) + quantityToAdd;
          const finalQuantity = Math.min(9999, newQuantity);
          return {
            ...entry,
            quantity: finalQuantity,
            value: selectedItem.value * finalQuantity,
          };
        }
        return entry;
      });
      setTableEntries(updatedEntries);
      handleAnimations(selectedItem.name, false, valueChange);
    } else {
      // Item does not exist, add it as a new entry
      setTableEntries([
        ...tableEntries,
        {
          ...selectedItem,
          quantity: quantityToAdd,
          value: selectedItem.value * quantityToAdd,
          id: Date.now().toString(),
        },
      ]);
      handleAnimations(selectedItem.name, false, valueChange);

      // Scroll to the bottom of the table after a short delay to ensure the new item is rendered
      setTimeout(() => {
        if (bottomOfTable.current) {
          bottomOfTable.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 100);
    }
    // Reset form
    setSearchQuery('');
    setSelectedItem(null);
    setQuantity(null);
    // Defer focus to allow state update to propagate
    setTimeout(() => {
      if (itemNameInputRef.current) {
        itemNameInputRef.current.focus();
      }
    }, 0);
  };

  const handleAnimations = (itemName: string, isDecreasing: boolean, valueChange: number) => {
    if (valueChange === 0) return;
    // Clear any existing animation timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    addFloatingValue(valueChange, !isDecreasing);

    // Briefly set to null to ensure animation re-triggers
    setLastUpdatedItemName(null);
    setIsQuantityDecreasing(false);

    // Use requestAnimationFrame to ensure the null state is processed
    requestAnimationFrame(() => {
      setLastUpdatedItemName(itemName);
      setIsQuantityDecreasing(isDecreasing);
      // Set new timeout
      animationTimeoutRef.current = setTimeout(() => {
        setLastUpdatedItemName(null);
        setIsQuantityDecreasing(false);
        animationTimeoutRef.current = null;
      }, 750);
    });
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddItem();
  };

  // Update item quantity in table
  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    let itemName = '';
    let isDecreasing: boolean | null = null;
    let valueChange = 0;

    const updatedEntries = tableEntries.map(entry => {
      if (entry.id === id) {
        itemName = entry.name;
        const oldQuantity = entry.quantity ?? 0;
        const updatedQuantity = Math.max(1, Math.min(9999, newQuantity));
        const baseValue = entry.value / oldQuantity;
        const newValue = baseValue * updatedQuantity;

        valueChange = Math.abs(newValue - entry.value);
        isDecreasing = updatedQuantity < oldQuantity ? true : false;

        return {
          ...entry,
          quantity: updatedQuantity,
          value: newValue
        };
      }
      return entry;
    });

    setTableEntries(updatedEntries);
    if (isDecreasing !== null) {
      handleAnimations(itemName, isDecreasing, valueChange);
    }
  };

  const handleCreatedCustomItem = useCallback(() => {
    const newCustomItems = getCustomItems()
    setCustomItems(newCustomItems)
    const newCustomItem = newCustomItems[newCustomItems.length - 1]
    setSelectedItem(newCustomItem)
    setSearchQuery(newCustomItem.name)
    // Use requestAnimationFrame to ensure state updates have completed
    requestAnimationFrame(() => {
      if (quantityInputRef.current) {
        quantityInputRef.current.focus();
        quantityInputRef.current.select();
      }
    });
  }, [])

  // Delete item from table
  const handleDeleteItem = (name: string, deleteFromCustomItems: boolean = false) => {
    const itemToDelete = tableEntries.find(entry => entry.name === name);
    if (itemToDelete) {
      handleAnimations(itemToDelete.name, true, itemToDelete.value * (itemToDelete.quantity ?? 1));
    }
    setTableEntries(tableEntries.filter(entry => entry.name !== name));
    if (deleteFromCustomItems) {
      const updatedCustomItems = deleteCustomItem(name);
      setCustomItems(updatedCustomItems);
      setSearchResultsKey(prev => prev + 1);
    }
  };

  const getNpcColor = (npcName: string) => {
    if (npcName.startsWith("Alesar")) return 'text-green-600';
    else if (npcName.startsWith("Nah'Bob")) return 'text-blue-600';
    return '';
  }

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchResultsRef.current &&
        !searchResultsRef.current.contains(event.target as Node) &&
        !itemNameInputRef.current?.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Organize entries into an object where the keys are NPC names and values are arrays of items
  const groupedEntries = useMemo(() => {
    const entriesByNpc: Record<string, (ExtendedItemData)[]> = {};

    tableEntries.forEach(entry => {
      // For each NPC that buys this item
      entry.npcNames.forEach(npcName => {
        if (!entriesByNpc[npcName]) {
          entriesByNpc[npcName] = [];
        }

        // Check if we already added this item to this NPC
        const existingItemIndex = entriesByNpc[npcName].findIndex(item => item.id === entry.id);

        if (existingItemIndex === -1) {
          // Add the item to this NPC's list
          entriesByNpc[npcName].push(entry);
        }
      });
    });

    return entriesByNpc;
  }, [tableEntries]);

  return (
    <div className="container">
      <MiniHeaderCollage />
      <div className="main-content">
        <div className="form-section">
          <form className="search-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="category-select">Category</label>
              <select
                id="category-select"
                value={selectedCategory}
                onChange={handleCategoryChange}
                className="category-select"
              >
                {Object.values(CATEGORIES).map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="item-search">Item Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={itemNameInputRef}
                  id="item-search"
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={handleSearchFocus}
                  onBlur={() => setIsItemNameInputFocused(false)}
                  onKeyPress={handleSearchKeyPress}
                  onKeyUp={handleDeleteKeyUp}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setSearchQuery('');
                      setSearchResults(filteredItems);
                      setSelectedItem(null);
                    }
                  }}
                  placeholder="Search for an item..."
                  autoComplete="off"
                />
                {searchQuery.trim().length > 0 && isItemNameInputFocused && <span className="search-results-esc-tip">Press ESC to clear</span>}

                {showResults && searchResults.length > 0 && (
                  <div
                    key={searchResultsKey}
                    className={`search-results ${selectedCategory === CATEGORIES.CUSTOM || searchQuery.trim() ? 'list-view' : 'grid-view'}`}
                    ref={searchResultsRef}
                  >

                    {selectedCategory === CATEGORIES.CUSTOM || searchQuery.trim() ? (
                      // Standard list layout
                      searchResults.map((item, index) => (
                        <div
                          key={index}
                          className={`search-result-item${index === 0 ? ' search-result-item--active' : ''}`}
                          onClick={() => handleSelectItem(item)}
                        >
                          {searchQuery.trim().length > 0 && isItemNameInputFocused && <span className="search-results-enter-tip">Press ENTER to accept</span>}
                          {item.category === CATEGORIES.CUSTOM && isItemNameInputFocused && <span className={` ${searchQuery.trim().length > 0 ? 'search-results-delete-tip' : "search-results-enter-tip"}`}>Press DEL to delete</span>}
                          <div className="item-row">
                            <div className="item-image">
                              <img
                                src={item.imageBase64 || placeholderBase64}
                                alt={item.name}
                                onError={handleImageError}
                              />
                            </div>
                            <div className="item-content">
                              <div className="item-name">{item.name}</div>
                              <div className="item-details">
                                <span className="gold-text">{item.category === "New Custom" ? '?' : getDisplayValue(item.value)} gp</span>
                                <span className={`npc-indicator ${item.category === "New Custom" ? 'new-custom' : ''}`}>
                                  {item.npcNames.length > 1
                                    ? ` ${item.npcNames.length} NPCs`
                                    : ` ${item.npcNames[0]}`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      // Grid layout with images
                      searchResults.map((item, index) => (
                        <div
                          key={index}
                          className={`search-result-item${index === 0 ? ' search-result-item--active' : ''}`}
                          onClick={() => handleSelectItem(item)}
                        >
                          <div
                            className="item-bg"
                            style={{ backgroundImage: `url('${item.imageBase64 || placeholderBase64}')` }}
                          />
                          <div className="item-content">
                            <div className="item-value">{getDisplayValue(item.value)} gp</div>
                            <div className="item-name">{item.name}</div>
                          </div>
                        </div>
                      ))
                    )}
                    {filteredItems.length > 0 && (
                      <div className="search-results-footer">
                        Showing {searchResults.length} {searchResults.length == 1 ? "item" : "items"}{searchQuery.trim() ? " matching your search" : " in this category"}.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="quantity">Quantity</label>
              <input
                id="quantity"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="0"
                placeholder="1"
                autoComplete='off'
                max="9999"
                value={quantity ?? ''}
                onChange={handleQuantityChange}
                onKeyPress={handleQuantityKeyPress}
                ref={quantityInputRef}
              />
            </div>

            <button type="submit" disabled={!selectedItem}>
              <p style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                Add {selectedItem ? `${quantity ?? 1}x` : ''} {selectedItem?.name ?? 'Item'} {selectedItem && <img src={selectedItem.imageBase64 || placeholderBase64} alt={selectedItem.name} className="item-image" onError={handleImageError} />}
              </p>
            </button>
          </form>
        </div>
        <div style={{ width: '100%' }}>

          <HeaderCollage />
          <div className="inventory-section">
            <table className="item-table">
              <thead >
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Value</th>
                  <th>NPC(s)</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {tableEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <img
                        src={entry.imageBase64 || placeholderBase64}
                        alt={entry.name}
                        className="table-item-image"
                        onError={handleImageError}
                      />
                    </td>
                    <td>{entry.name}</td>

                    <td>
                      <input
                        type="number"
                        min="0"
                        max="9999"
                        value={entry.quantity}
                        onChange={(e) => handleUpdateQuantity(entry.id ?? '', parseInt(e.target.value, 10) || 1)}
                        className={`quantity-input ${lastUpdatedItemName === entry.name ? (isQuantityDecreasing ? 'highlight-update-decrease' : 'highlight-update') : ''}`}
                      />
                    </td>
                    <td style={{ minWidth: '140px', maxWidth: '140px', verticalAlign: 'middle', padding: '0px 0px 0px 10px' }}>
                      <div style={{ minHeight: "70px", display: 'flex', alignItems: 'center' }}>
                        @
                        <span className="gold-text">{(entry.value / (entry.quantity ?? 1)) > 1000 ? `${(entry.value / (entry.quantity ?? 1)) / 1000}k` : (entry.value / (entry.quantity ?? 1))} = </span>
                        <span className={`calculated-item-total ${lastUpdatedItemName === entry.name ? (isQuantityDecreasing ? 'less-gold-animation' : 'more-gold-animation') : ''}`}>&nbsp;{getDisplayValue(entry.value)}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', width: '40px' }}>
                      {entry.category !== CATEGORIES.CUSTOM && <div className="tooltip-container">
                        <span className="npc-count">{entry.npcNames.length}</span>
                        < div className="tooltip">
                          <div className="tooltip-content">
                            {entry.npcNames.map((npc) => (
                              <span key={npc} className={`tooltip-item ${getNpcColor(npc)}`}>{npc}</span>
                            ))}
                          </div>
                        </div>
                      </div>}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDeleteItem(entry.name ?? '')}
                        className="delete-button"
                        title="Remove entry"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableEntries.length == 0 && (
              <div className="no-items-message">
                No items added yet
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", height: "100px" }} ref={bottomOfTable} />


      {totalValue > 0 && (
        <div className="total-footer">
          <div className="total-gold-container">
            {floatingValues.map(({ id, value, isPositive }) => (
              <div
                key={id}
                className={`floating-value ${isPositive ? 'positive' : 'negative'}`}
              >
                {isPositive ? '+' : '-'} {getDisplayValue(value)} gold
              </div>
            ))}
            <span className="total-gold-label">Total Gold:</span>
            <span className="total-gold-value">
              {getDisplayValue(totalValue)} gold
            </span>
          </div>
        </div>
      )}
      <ItemCreateModal
        open={isCreateModalOpen}
        name={searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1)}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreatedCustomItem}
      />
    </div>
  );
}

export default App; 