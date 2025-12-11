// Storage service for favorites and watch later
// Uses localStorage to persist data

const STORAGE_KEYS = {
  FAVORITES: 'pirateflix_favorites',
  WATCH_LATER: 'pirateflix_watch_later'
};

// Helper to get items from localStorage
const getItems = (key) => {
  try {
    const items = localStorage.getItem(key);
    return items ? JSON.parse(items) : [];
  } catch (error) {
    console.error(`Error reading ${key} from localStorage:`, error);
    return [];
  }
};

// Helper to save items to localStorage
const saveItems = (key, items) => {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.error(`Error saving ${key} to localStorage:`, error);
  }
};

// Favorites API
export const favoritesService = {
  getAll() {
    return getItems(STORAGE_KEYS.FAVORITES);
  },

  add(file) {
    const favorites = this.getAll();
    // Check if already exists
    if (!favorites.find(f => f.path === file.path)) {
      favorites.push({
        ...file,
        addedAt: new Date().toISOString()
      });
      saveItems(STORAGE_KEYS.FAVORITES, favorites);
    }
    return favorites;
  },

  remove(filePath) {
    const favorites = this.getAll();
    const filtered = favorites.filter(f => f.path !== filePath);
    saveItems(STORAGE_KEYS.FAVORITES, filtered);
    return filtered;
  },

  isFavorite(filePath) {
    const favorites = this.getAll();
    return favorites.some(f => f.path === filePath);
  },

  toggle(file) {
    if (this.isFavorite(file.path)) {
      this.remove(file.path);
      return false;
    } else {
      this.add(file);
      return true;
    }
  }
};

// Watch Later API
export const watchLaterService = {
  getAll() {
    return getItems(STORAGE_KEYS.WATCH_LATER);
  },

  add(file) {
    const watchLater = this.getAll();
    // Check if already exists
    if (!watchLater.find(f => f.path === file.path)) {
      watchLater.push({
        ...file,
        addedAt: new Date().toISOString()
      });
      saveItems(STORAGE_KEYS.WATCH_LATER, watchLater);
    }
    return watchLater;
  },

  remove(filePath) {
    const watchLater = this.getAll();
    const filtered = watchLater.filter(f => f.path !== filePath);
    saveItems(STORAGE_KEYS.WATCH_LATER, filtered);
    return filtered;
  },

  isInWatchLater(filePath) {
    const watchLater = this.getAll();
    return watchLater.some(f => f.path === filePath);
  },

  toggle(file) {
    if (this.isInWatchLater(file.path)) {
      this.remove(file.path);
      return false;
    } else {
      this.add(file);
      return true;
    }
  }
};

