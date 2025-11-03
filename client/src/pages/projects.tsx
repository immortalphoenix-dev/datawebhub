import { useState } from "react";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/project-card";
import { useProjects } from "@/hooks/use-projects";
import { Loader2, Plus } from "lucide-react";
import ProjectCardSkeleton from "@/components/project-card-skeleton";
import PageHeader from "@/components/page-header";

type FilterType = 'all' | 'web' | 'app' | 'data analysis';

export default function Projects() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const { data: projects, isLoading, error } = useProjects(activeFilter);
  
  // scroll-reveal disabled on this page to avoid hidden states

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All Projects' },
    { key: 'web', label: 'Web' },
    { key: 'app', label: 'App' },
    { key: 'data analysis', label: 'Data Analysis' },
  ];

  return (
    <>
      <PageHeader
        title={<>Featured <span className="text-primary">Projects</span></>}
        subtitle="A showcase of my latest work, featuring innovative solutions and cutting-edge technologies."
      />
      <section id="projects-content" className="py-24 sm:py-32 bg-background">
        <div className="container mx-auto px-6 lg:px-8 max-w-7xl">
          {/* Project Filters */}
          <div className="flex justify-center mb-16 relative z-50">
          <div className="bg-card/80 border rounded-xl p-2 flex gap-2 flex-wrap shadow-sm text-foreground opacity-100" style={{ opacity: 1, visibility: 'visible' }}>
            {filters.map((filter) => (
              <Button
                key={filter.key}
                variant={activeFilter === filter.key ? "default" : "ghost"}
                onClick={() => setActiveFilter(filter.key)}
                className="px-5 py-2.5 rounded-lg font-semibold opacity-100 text-foreground focus-visible:ring-primary"
                style={{ opacity: 1, visibility: 'visible' }}
                data-testid={`filter-${filter.key}`}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <h3 className="text-2xl font-bold text-destructive mb-4">Failed to load projects</h3>
            <p className="text-muted-foreground">{error.message}</p>
            <p className="text-sm text-muted-foreground mt-2">Check console for more details</p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {projects?.map((project) => (
                <ProjectCard key={project.$id} project={project} />
              ))}
            </div>
            
            {projects?.length === 0 && (
              <div className="text-center py-20">
                <h3 className="text-2xl font-bold text-foreground mb-4">No projects found</h3>
                <p className="text-muted-foreground">
                  {activeFilter === 'all' 
                    ? 'No projects are available at the moment.' 
                    : `No ${activeFilter} projects found. Try a different filter.`}
                </p>
              </div>
            )}
            
            <div className="text-center">
              <Button 
                size="lg"
                variant="outline"
                data-testid="button-load-more"
              >
                <Plus className="w-5 h-5 mr-2" />
                Load More Projects
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
    </>
  );
}
