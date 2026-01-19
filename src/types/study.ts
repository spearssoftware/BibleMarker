/**
 * Study System Types
 * 
 * Studies allow keywords to be scoped globally or to specific books.
 */

export interface Study {
  id: string;
  name: string;                  // e.g., "John - Character Study"
  book?: string;                  // Optional: scope to book (e.g., "John")
  isActive: boolean;              // Currently active study
  createdAt: Date;
  updatedAt: Date;
}
