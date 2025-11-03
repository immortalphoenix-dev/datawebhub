import { useQuery } from "@tanstack/react-query";
import { databases } from "@/lib/appwrite";
import { Query } from "appwrite";
import type { Project } from "@shared/schema";
import { useState, useEffect } from "react";

// IMPORTANT: Replace with your actual Appwrite Database ID
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const PROJECTS_COLLECTION_ID = 'projects';

if (!DATABASE_ID) {
  console.error('VITE_APPWRITE_DATABASE_ID is not set!');
}

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
          } catch {}
        }
        
        if (!DATABASE_ID) {
          throw new Error('DATABASE_ID is not configured');
        }
        
        const queries = [];
        if (category && category !== 'all') {
          queries.push(Query.equal('category', category));
        }
        
        const response = await databases.listDocuments(
          DATABASE_ID,
          PROJECTS_COLLECTION_ID,
          queries
        );
        
        const projects = response.documents as unknown as Project[];
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
      const response = await databases.listDocuments(
        DATABASE_ID,
        PROJECTS_COLLECTION_ID,
        [Query.equal('isFeatured', true)]
      );
      return response.documents as unknown as Project[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Prefetch projects and cache in sessionStorage for instant navigation
export async function prefetchProjects() {
  try {
    if (!DATABASE_ID) return;
    const response = await databases.listDocuments(
      DATABASE_ID,
      PROJECTS_COLLECTION_ID,
      []
    );
    const items = response.documents as unknown as Project[];
    sessionStorage.setItem('prefetched-projects', JSON.stringify({ ts: Date.now(), items }));
  } catch (e) {
    // Ignore prefetch errors silently
  }
}