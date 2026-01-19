import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { useState, useEffect } from "react";

// Use the backend API instead of Appwrite client directly - this works
// regardless of whether VITE_APPWRITE_* env vars are set during build
const API_BASE = '';

export function useProjects(category?: string) {
  const [data, setData] = useState<Project[] | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Serve prefetched projects immediately if available
        const cached = sessionStorage.getItem('prefetched-projects');
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as { ts: number; items: Project[] };
            setData(parsed.items);
          } catch { }
        }

        // Fetch from backend API
        const url = category && category !== 'all'
          ? `${API_BASE}/api/projects/category/${category}`
          : `${API_BASE}/api/projects`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }

        const projects = await response.json() as Project[];
        setData(projects);
      } catch (err) {
        console.error('useProjects: Error fetching projects:', err);
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [category]);

  return { data, isLoading, error };
}

export function useFeaturedProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects', 'featured'],
    queryFn: async () => {
      // Fetch all projects from backend API (featured filtering can be done on backend later)
      const response = await fetch(`${API_BASE}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Prefetch projects and cache in sessionStorage for instant navigation
export async function prefetchProjects() {
  try {
    const response = await fetch(`${API_BASE}/api/projects`);
    if (!response.ok) return;
    const items = await response.json() as Project[];
    sessionStorage.setItem('prefetched-projects', JSON.stringify({ ts: Date.now(), items }));
  } catch (e) {
    // Ignore prefetch errors silently
  }
}
