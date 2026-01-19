import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useScrollReveal } from "@/lib/animations";
import { Briefcase, Code, Star } from "lucide-react";
import PageHeader from "@/components/page-header";
import portfolioImage from "@/assets/portfolio.jpeg";

export default function About() {
  useScrollReveal();

  // NOTE: This is placeholder data for demonstration purposes.
  // In a real application, this data would likely be fetched from an API.
  const skills = [
    "JavaScript",
    "TypeScript",
    "React",
    "Tailwind CSS",
    "Next.js",
    "Express.js",
    "Node.js",
    "HTML",
    "CSS",
    "Python"
  ];

  const experiences = [
    {
      title: "Freelance Website Designer & Data Analyst",
      company: "Independent Contractor",
      period: "2022 - Present",
      description: "Working as a freelance developer, delivering custom web applications and data analysis solutions for clients. Specializing in responsive website design, full-stack development with React/Next.js, and quantitative data analysis using Python and statistical modeling techniques."
    },
    {
      title: "Self-Taught Full-Stack Developer",
      company: "Personal Development",
      period: "2020 - 2022",
      description: "Dedicated self-learning journey mastering modern web technologies including React, TypeScript, Node.js, and Express.js. Built personal projects and gained expertise in mobile development for Android platforms while developing strong foundations in data analysis and visualization."
    },
    {
      title: "Data Analysis & Research Assistant",
      company: "Academic Projects",
      period: "2019 - 2020",
      description: "Applied econometric and statistical analysis techniques to academic research projects. Developed skills in data visualization, quantitative research methods, and statistical modeling using Python, R, and various analytical tools."
    }
  ];

  return (
    <>
      <PageHeader
        title={<>About <span className="text-primary">Me</span></>}
        subtitle="I'm a passionate full-stack developer with expertise in modern web technologies, creating exceptional digital experiences that combine functionality with stunning design."
      />
      <section id="about-content" className="py-8 sm:py-24 lg:py-32 bg-background">
        <div className="container mx-auto px-6 lg:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-16 items-start">
            {/* Left Column: Profile */}
            <div className="lg:col-span-1 space-y-6 sm:space-y-6 lg:space-y-8 lg:sticky top-24">
              <Avatar className="w-40 h-40 sm:w-48 sm:h-48 mx-auto border-4 border-primary shadow-xl">
                <AvatarImage src={portfolioImage} alt="Profile photo" className="object-cover" />
                <AvatarFallback>AJ</AvatarFallback>
              </Avatar>
              <div className="text-center hidden sm:block">
                <h3 className="font-heading text-xl sm:text-3xl font-bold text-foreground" data-testid="text-name">
                  {(import.meta.env.VITE_USER_NAME) || "Your Name"}
                </h3>
                <p className="text-primary text-sm sm:text-lg font-medium" data-testid="text-title">
                  {(import.meta.env.VITE_USER_TITLE) || "Your Professional Title"}
                </p>
              </div>
              <p className="relative z-10 text-foreground/90 text-center text-base sm:text-lg leading-relaxed my-4 sm:my-6" data-testid="text-bio">
                {(import.meta.env.VITE_USER_BIO) || "Add your professional bio via the VITE_USER_BIO environment variable."}
              </p>
            </div>

            {/* Right Column: Experience & Skills */}
            <div className="lg:col-span-2 space-y-8 sm:space-y-16">
              {/* Experience Timeline */}
              <div className="scroll-reveal">
                <h3 className="font-heading text-2xl sm:text-3xl font-bold text-foreground mb-6 sm:mb-8 flex items-center">
                  <Briefcase className="w-6 h-6 sm:w-8 sm:h-8 mr-3 sm:mr-4 text-primary" />
                  Work Experience
                </h3>
                <div className="relative border-l-2 border-border pl-6 sm:pl-8 space-y-8 sm:space-y-12">
                  {experiences.map((exp, index) => (
                    <div key={index} className="relative">
                      <div className="absolute -left-8 sm:-left-10 w-4 h-4 bg-primary rounded-full border-4 border-background"></div>
                      <p className="text-xs sm:text-sm text-primary font-semibold">{exp.period}</p>
                      <h4 className="font-semibold text-foreground text-lg sm:text-xl mt-1">{exp.title}</h4>
                      <p className="text-muted-foreground font-medium text-sm sm:text-base">{exp.company}</p>
                      <p className="text-muted-foreground mt-2 text-sm sm:text-base">{exp.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skills Grid */}
              <div className="scroll-reveal">
                <h3 className="font-heading text-2xl sm:text-3xl font-bold text-foreground mb-6 sm:mb-8 flex items-center">
                  <Code className="w-6 h-6 sm:w-8 sm:h-8 mr-3 sm:mr-4 text-primary" />
                  Technical Skills
                </h3>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {skills.map((skill) => (
                    <div key={skill} className="flex items-center bg-card border rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
                      <Star className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-primary" />
                      <span className="font-medium text-card-foreground text-sm sm:text-base">{skill}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
