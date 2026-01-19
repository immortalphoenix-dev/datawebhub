import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Prompt } from "@shared/schema";
import { Loader2, Edit, Trash2 } from "lucide-react";
import { account } from "@/lib/appwrite";

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(""); // Now holds merged description
  const [category, setCategory] = useState("web");
  const [technologies, setTechnologies] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null); // Reintroduced imageFile state
  const [imageUrl, setImageUrl] = useState(""); // Direct image URL
  const [demoUrl, setDemoUrl] = useState("");
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  const [promptText, setPromptText] = useState("");
  const [promptType, setPromptType] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if Appwrite is configured
        if (!account) {
          console.warn('Authentication not configured');
          window.location.href = "/admin/login";
          return;
        }
        await account.get();
        setIsAuthenticated(true);
      } catch (error) {
        // User is not authenticated, redirect to login
        window.location.href = "/admin/login";
      } finally {
        setIsLoadingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Fetch existing prompts - must be called before any conditional returns
  const { data: prompts, isLoading: isLoadingPrompts, error: promptsError } = useQuery<Prompt[]>({
    queryKey: ["prompts"],
    queryFn: async () => {
      const response = await fetch("/api/prompts");
      if (!response.ok) {
        throw new Error("Failed to fetch prompts");
      }
      return response.json();
    },
  });

  // Show loading while checking authentication
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingProject(true);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("category", category);
    formData.append("technologies", technologies);
    if (demoUrl.trim()) {
      formData.append("demoUrl", demoUrl.trim());
    }
    if (imageFile) {
      formData.append("image", imageFile);
    }

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        body: formData, // Send FormData directly
      });

      if (response.ok) {
        toast({
          title: "Project Uploaded",
          description: "Your new project has been added successfully.",
        });
        // Clear form
        setTitle("");
        setDescription("");
        setCategory("web");
        setTechnologies("");
        setImageFile(null); // Clear file input
        setDemoUrl("");
      } else {
        const errorData = await response.json();
        toast({
          title: "Upload Failed",
          description: errorData.message || "An error occurred.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "An error occurred",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleSubmitPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingPrompt(true);

    const promptData = {
      promptText,
      promptType,
      isActive,
    };

    const method = editingPromptId ? "PUT" : "POST";
    const url = editingPromptId ? `/api/prompts/${editingPromptId}` : "/api/prompts";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(promptData),
      });

      if (response.ok) {
        toast({
          title: `Prompt ${editingPromptId ? "Updated" : "Added"}`,
          description: `AI prompt has been ${editingPromptId ? "updated" : "added"} successfully.`,
        });
        // Invalidate prompts query to refetch list
        queryClient.invalidateQueries({ queryKey: ["prompts"] });
        // Clear form
        setPromptText("");
        setPromptType("");
        setIsActive(true);
        setEditingPromptId(null); // Exit editing mode
      } else {
        const errorData = await response.json();
        toast({
          title: `Prompt ${editingPromptId ? "Update" : "Add"} Failed`,
          description: errorData.message || "An error occurred.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "An error occurred",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const handleEditPrompt = (prompt: Prompt) => {
    setEditingPromptId(prompt.$id);
    setPromptText(prompt.promptText);
    setPromptType(prompt.promptType);
    setIsActive(prompt.isActive);
  };

  const handleDeletePrompt = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this prompt?")) {
      return;
    }
    try {
      const response = await fetch(`/api/prompts/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Prompt Deleted",
          description: "AI prompt has been deleted successfully.",
        });
        queryClient.invalidateQueries({ queryKey: ["prompts"] });
      } else {
        const errorData = await response.json();
        toast({
          title: "Delete Failed",
          description: errorData.message || "An error occurred.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "An error occurred",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="py-12 bg-background">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        </div>
        <div className="bg-card p-4 md:p-8 rounded-2xl shadow-lg border mb-8">
          <h2 className="text-2xl font-bold text-card-foreground mb-6">
            Upload New Project
          </h2>
          <form onSubmit={handleSubmitProject} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 border rounded-md">
                  <option value="web">Web</option>
                  <option value="app">App</option>
                  <option value="data analysis">Data Analysis</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="technologies">Technologies (comma-separated)</Label>
              <Input id="technologies" value={technologies} onChange={(e) => setTechnologies(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageFile">Image File (Required)</Label>
              <Input id="imageFile" type="file" onChange={(e) => setImageFile(e.target.files ? e.target.files[0] : null)} required />
              <p className="text-sm text-muted-foreground">Upload an image for your project</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="demoUrl">Demo URL (Optional)</Label>
              <Input id="demoUrl" type="url" placeholder="https://your-demo-link.com" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} />
            </div>
            <Button type="submit" disabled={isLoadingProject}>
              {isLoadingProject ? "Uploading..." : "Upload Project"}
            </Button>
          </form>
        </div>

        {/* Prompt Management Section */}
        <div className="bg-card p-4 md:p-8 rounded-2xl shadow-lg border mb-8">
          <h2 className="text-2xl font-bold text-card-foreground mb-6">
            {editingPromptId ? "Edit AI Prompt" : "Add New AI Prompt"}
          </h2>
          <form onSubmit={handleSubmitPrompt} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="promptText">Prompt Content</Label>
              <Textarea id="promptText" value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={5} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promptType">Prompt Type</Label>
              <Input id="promptType" value={promptType} onChange={(e) => setPromptType(e.target.value)} required />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 text-primary rounded"
              />
              <Label htmlFor="isActive">Is Active</Label>
            </div>
            <div className="flex gap-4">
              <Button type="submit" disabled={isLoadingPrompt}>
                {isLoadingPrompt ? (editingPromptId ? "Updating..." : "Adding...") : (editingPromptId ? "Update Prompt" : "Add Prompt")}
              </Button>
              {editingPromptId && (
                <Button variant="outline" onClick={() => {
                  setEditingPromptId(null);
                  setPromptText("");
                  setPromptType("");
                  setIsActive(true);
                }}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Existing Prompts List */}
        <div className="bg-card p-4 md:p-8 rounded-2xl shadow-lg border">
          <h2 className="text-2xl font-bold text-card-foreground mb-6">
            Existing AI Prompts
          </h2>
          {isLoadingPrompts ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : promptsError ? (
            <div className="text-center py-10">
              <p className="text-destructive">Failed to load prompts: {promptsError.message}</p>
            </div>
          ) : prompts && prompts.length > 0 ? (
            <div className="space-y-4">
              {prompts.map((prompt) => (
                <div key={prompt.$id} className="p-4 border rounded-lg bg-muted/50 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-card-foreground">Type: {prompt.promptType}</p>
                    <p className="text-sm text-muted-foreground">{prompt.promptText.substring(0, 100)}...</p>
                    <p className="text-xs text-muted-foreground">Active: {prompt.isActive ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleEditPrompt(prompt)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDeletePrompt(prompt.$id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              No prompts added yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}