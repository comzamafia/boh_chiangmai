import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ChefHat } from "lucide-react";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8">
            <div className="relative">
                <div className="text-[10rem] font-playfair font-black text-primary/10 leading-none select-none">
                    404
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <ChefHat className="h-20 w-20 text-primary/40" />
                </div>
            </div>

            <div className="space-y-3">
                <h2 className="text-3xl font-bold font-playfair text-primary">
                    Page Not Found
                </h2>
                <p className="text-muted-foreground max-w-md">
                    Looks like this recipe doesn&apos;t exist in our system.
                    The page you&apos;re looking for may have been moved or deleted.
                </p>
            </div>

            <Link href="/">
                <Button size="lg" className="px-8">
                    <Home className="mr-2 h-4 w-4" /> Back to Home
                </Button>
            </Link>
        </div>
    );
}
