import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { Loader2, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) {
    throw new Error("Failed to fetch project");
  }
  return res.json();
}

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;

  const { data: project, isLoading, error } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: !!projectId,
  });

  if (project) {
    console.log('ProjectDetail rendering project:', project);
  } else {
    console.log('ProjectDetail: project is undefined/loading');
  }

  if (isLoading) {
    return (
      <section className="py-24 sm:py-32">
        <div className="container mx-auto px-6 lg:px-8 max-w-4xl space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
          </div>
          <Skeleton className="h-80 w-full rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <h2 className="text-2xl font-bold text-destructive mb-4">
            Failed to load project
          </h2>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <h2 className="text-2xl font-bold text-foreground">Project not found</h2>
      </div>
    );
  }

  return (
    <section className="py-24 sm:py-32">
      <div className="container mx-auto px-6 lg:px-8 max-w-4xl">
        <div className="mb-12">
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground mb-4">
            {project.title}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            {project.description}
          </p>
        </div>

        <img
          src={project.imageUrl}
          alt={project.title}
          className="w-full rounded-2xl shadow-lg mb-12"
          loading="lazy"
          decoding="async"
          sizes="(max-width: 1024px) 100vw, 800px"
        />

        <div className="mt-12 flex flex-wrap gap-4">
          {project.demoUrl && (
            <Button asChild>
              <a href={project.demoUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Live Demo
              </a>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}