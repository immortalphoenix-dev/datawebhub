import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@shared/schema";
import { Link } from "wouter";

interface ProjectCardProps {
  project: Project;
}

const MAX_DESCRIPTION_LENGTH = 120;

export default function ProjectCard({ project }: ProjectCardProps) {
  const { title, description, imageUrl, technologies = [], demoUrl, $id } = project;

  const shouldTruncate = description && description.length > MAX_DESCRIPTION_LENGTH;
  const displayedDescription = shouldTruncate
    ? description?.substring(0, MAX_DESCRIPTION_LENGTH) + "..."
    : description;

  return (
    <Link href={`/projects/${$id}`} className="block h-full">
      <div
        className="project-card bg-card rounded-2xl overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 h-full opacity-100 relative z-10 cursor-pointer"
        style={{ opacity: 1, visibility: 'visible' }}
      >
        <img
          src={imageUrl?.replace('/download?', '/view?')}
          alt={`${title} - ${description}`}
          className="w-full h-56 object-cover block opacity-100"
          loading="lazy"
          decoding="async"
          sizes="(max-width: 1024px) 100vw, 33vw"
          onError={(e) => {
            console.log('Image failed to load:', imageUrl);
            e.currentTarget.src = `https://placehold.co/400x300?text=${encodeURIComponent(title)}`;
          }}
        />
        <div className="p-6">
          <h3
            className="font-heading text-lg md:text-xl font-bold text-card-foreground mb-2"
            data-testid={`text-project-title-${$id}`}
          >
            {title}
          </h3>
          <p
            className="text-muted-foreground mb-4 text-sm md:text-base leading-relaxed"
            data-testid={`text-project-description-${$id}`}
          >
            {displayedDescription}
          </p>
          {shouldTruncate && (
            <div className="text-primary text-sm font-semibold mb-4">
              Read More
            </div>
          )}

          {/* Technologies */}
          <div className="flex flex-wrap gap-2 mb-6">
            {technologies.map((tech) => (
              <span
                key={tech}
                className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground"
                data-testid={`tech-${tech.toLowerCase()}-${$id}`}
              >
                {tech}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            {demoUrl && (
              <a
                href={demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                data-testid={`link-demo-${$id}`}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Live Demo
              </a>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
