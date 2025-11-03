import { Link } from "wouter";
import { Github, Linkedin, Twitter, Rocket, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/lib/animations";
import { TypeAnimation } from "react-type-animation";
import ProjectCard from "@/components/project-card";
import { useFeaturedProjects, prefetchProjects } from "@/hooks/use-projects";
import ParticleBackground from "@/components/particle-background";

export default function Home() {
  useScrollReveal();
  const { data: featuredProjects, isLoading: isLoadingProjects } = useFeaturedProjects();

  return (
    <>
      <section id="home" className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <ParticleBackground />
        <div className="container mx-auto px-6 lg:px-8 max-w-7xl relative z-10">
          <div className="text-center scroll-reveal">
            <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl font-extrabold leading-tight tracking-tighter mb-6 md:mb-8">
              <span className="block text-foreground">
                Hello, I'm Romeo.
              </span>
              <TypeAnimation
                sequence={[
                  'A Creative Developer.',
                  2000,
                  'I build things for the web.',
                  2000,
                  'Let\'s create something amazing.',
                  2000,
                ]}
                wrapper="span"
                speed={50}
                className="block text-primary text-4xl md:text-5xl lg:text-6xl mt-4"
                repeat={Infinity}
              />
            </h1>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/projects">
                <Button size="lg" data-testid="button-view-work" onMouseEnter={() => prefetchProjects()} onFocus={() => prefetchProjects()}>
                  <Rocket className="mr-2" />
                  View My Work
                </Button>
              </Link>
            </div>
            
            <div className="flex gap-4 pt-8 md:pt-12 justify-center">
              {(import.meta.env.VITE_GITHUB_URL) && (
                <a href={import.meta.env.VITE_GITHUB_URL} className="text-muted-foreground hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  <Github className="w-7 h-7" />
                </a>
              )}
              {(import.meta.env.VITE_LINKEDIN_URL) && (
                <a href={import.meta.env.VITE_LINKEDIN_URL} className="text-muted-foreground hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  <Linkedin className="w-7 h-7" />
                </a>
              )}
              {(import.meta.env.VITE_TWITTER_URL) && (
                <a href={import.meta.env.VITE_TWITTER_URL} className="text-muted-foreground hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  <Twitter className="w-7 h-7" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Featured Projects Section */}
      {featuredProjects && featuredProjects.length > 0 && (
        <section id="featured-projects" className="py-24 bg-card">
          <div className="container mx-auto px-6 lg:px-8 max-w-7xl">
            <div className="text-center mb-16 scroll-reveal">
              <h2 className="font-heading text-4xl lg:text-5xl font-bold text-card-foreground mb-4">
                Featured <span className="text-primary">Projects</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                A selection of my best work, showcasing my skills and creativity.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredProjects.slice(0, 3).map((project) => (
                <ProjectCard key={project.$id} project={project} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Call to Action Section */}
      <section id="cta" className="py-24 bg-background">
        <div className="container mx-auto px-6 lg:px-8 max-w-4xl text-center">
          <div className="scroll-reveal">
            <h2 className="font-heading text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Have a project in mind?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              I'm always open to discussing new projects and opportunities. Let's build something amazing together.
            </p>
            <Link href="/chat">
              <Button size="lg" variant="secondary" data-testid="button-cta-chat">
                <MessageCircle className="mr-2" />
                Let's Chat
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
