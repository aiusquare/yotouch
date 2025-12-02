import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  LogOut,
  User,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  Camera,
  ShieldCheck,
  Users,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userRequest, setUserRequest] = useState<any>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [validatorStats, setValidatorStats] = useState({
    completed: 0,
    pending: 0,
    rejected: 0,
    successRate: 0,
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadUserRoles();
      loadUserVerificationRequest();
    }
  }, [user]);

  useEffect(() => {
    if (userRoles.includes("admin")) {
      navigate("/admin", { replace: true });
    }
  }, [userRoles, navigate]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`verification-request-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "verification_requests",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUserVerificationRequest();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (
      userRoles.includes("primary_validator") ||
      userRoles.includes("secondary_validator")
    ) {
      loadPendingRequestsCount();
      loadValidatorStats();

      // Subscribe to real-time changes
      const channel = supabase
        .channel("verification-requests-changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "verification_requests",
            filter: "status=eq.pending",
          },
          (payload) => {
            console.log("New verification request:", payload);
            // Show toast notification for new requests
            toast({
              title: "New Verification Request",
              description:
                "A new verification request has been submitted and is awaiting review.",
              duration: 5000,
            });
            // Reload count and stats
            loadPendingRequestsCount();
            loadValidatorStats();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "verification_requests",
          },
          () => {
            // Reload count and stats when status changes
            loadPendingRequestsCount();
            loadValidatorStats();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "verification_requests",
          },
          () => {
            // Reload count and stats when requests are deleted
            loadPendingRequestsCount();
            loadValidatorStats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userRoles, toast]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadUserVerificationRequest = async () => {
    if (!user?.id) return;
    try {
      setRequestLoading(true);
      const { data, error } = await supabase
        .from("verification_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setUserRequest(data);
    } catch (error) {
      console.error("Error loading verification request:", error);
    } finally {
      setRequestLoading(false);
    }
  };

  const loadUserRoles = async () => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user?.id);

      if (error) throw error;
      setUserRoles(data?.map((r) => r.role) || []);
    } catch (error) {
      console.error("Error loading user roles:", error);
    }
  };

  const loadPendingRequestsCount = async () => {
    try {
      const { count, error } = await supabase
        .from("verification_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      if (error) throw error;
      setPendingCount(count || 0);
    } catch (error) {
      console.error("Error loading pending requests count:", error);
    }
  };

  const loadValidatorStats = async () => {
    try {
      // Get counts for each status
      const { count: completedCount } = await supabase
        .from("verification_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "verified");

      const { count: pendingCount } = await supabase
        .from("verification_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: rejectedCount } = await supabase
        .from("verification_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "rejected");

      const completed = completedCount || 0;
      const rejected = rejectedCount || 0;
      const total = completed + rejected;
      const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      setValidatorStats({
        completed,
        pending: pendingCount || 0,
        rejected,
        successRate,
      });
    } catch (error) {
      console.error("Error loading validator stats:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "pending":
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case "rejected":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <User className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "verified":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "rejected":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const aiComplete = Boolean(
    userRequest &&
      userRequest.face_match_score !== null &&
      userRequest.liveness_score !== null
  );
  const primaryComplete =
    userRequest?.status === "primary_validated" ||
    userRequest?.status === "verified";
  const secondaryComplete = userRequest?.status === "verified";

  const profileStatus = profile?.verification_status || "unverified";
  const requestDerivedStatus = useMemo(() => {
    if (!userRequest?.status) return null;

    if (userRequest.status === "verified") {
      return "verified";
    }

    if (userRequest.status === "rejected") {
      return "rejected";
    }

    if (["pending", "primary_validated"].includes(userRequest.status)) {
      return "pending";
    }

    return null;
  }, [userRequest?.status]);

  const verificationStatus = useMemo(() => {
    if (
      profileStatus === "unverified" &&
      requestDerivedStatus &&
      requestDerivedStatus !== "rejected"
    ) {
      return requestDerivedStatus;
    }

    return profileStatus;
  }, [profileStatus, requestDerivedStatus]);

  const finalComplete = verificationStatus === "verified";

  const progressSteps = [
    {
      title: "AI screening",
      description: "Liveness + face match checks",
      statusText: aiComplete ? "Captured" : "Awaiting upload",
      complete: aiComplete,
      icon: <Camera className="w-5 h-5" />,
    },
    {
      title: "Primary validator review",
      description: "Community validator in your area",
      statusText: primaryComplete ? "Cleared" : "Queued",
      complete: primaryComplete,
      icon: <ShieldCheck className="w-5 h-5" />,
    },
    {
      title: "Secondary validator review",
      description: "Distributed trust circle",
      statusText: secondaryComplete
        ? "Cleared"
        : primaryComplete
        ? "In review"
        : "Waiting",
      complete: secondaryComplete,
      icon: <Users className="w-5 h-5" />,
    },
    {
      title: "Final proof",
      description: "Cardano hash + profile badge",
      statusText: finalComplete ? "Minted" : "Pending",
      complete: finalComplete,
      icon: <CheckCircle className="w-5 h-5" />,
    },
  ];

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg mx-auto mb-4 animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-md">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">YoTouch</h1>
              <p className="text-xs text-muted-foreground">Dashboard</p>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Welcome Card */}
          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    Welcome back, {profile?.first_name} {profile?.last_name}!
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {user?.email}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(verificationStatus)}
                    <Badge className={getStatusColor(verificationStatus)}>
                      {verificationStatus}
                    </Badge>
                  </div>
                  {(userRoles.includes("primary_validator") ||
                    userRoles.includes("secondary_validator")) && (
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary border-primary/20"
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      {userRoles.includes("primary_validator")
                        ? "Primary Validator"
                        : "Secondary Validator"}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            {profile?.verification_score > 0 && (
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Verification Score
                    </span>
                    <span className="font-bold text-foreground">
                      {profile.verification_score}/100
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-500"
                      style={{ width: `${profile.verification_score}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Validator Dashboard Access */}
          {(userRoles.includes("primary_validator") ||
            userRoles.includes("secondary_validator")) && (
            <>
              <Card className="border-primary/50 shadow-lg bg-gradient-to-br from-primary/5 to-secondary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Validator Access
                  </CardTitle>
                  <CardDescription>
                    Access your validator dashboard to review verification
                    requests
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {userRoles.includes("primary_validator") && (
                    <Button
                      size="lg"
                      className="w-full relative"
                      onClick={() => navigate("/validator/primary")}
                    >
                      Open Primary Validator Dashboard
                      {pendingCount > 0 && (
                        <Badge className="ml-2 bg-destructive text-destructive-foreground">
                          {pendingCount}
                        </Badge>
                      )}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                  {userRoles.includes("secondary_validator") &&
                    !userRoles.includes("primary_validator") && (
                      <Button
                        size="lg"
                        className="w-full relative"
                        onClick={() => navigate("/validator/secondary")}
                      >
                        Open Secondary Validator Dashboard
                        {pendingCount > 0 && (
                          <Badge className="ml-2 bg-destructive text-destructive-foreground">
                            {pendingCount}
                          </Badge>
                        )}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                </CardContent>
              </Card>

              {/* Validator Statistics */}
              <Card className="border-border/50 shadow-lg">
                <CardHeader>
                  <CardTitle>Validator Statistics</CardTitle>
                  <CardDescription>
                    Overview of your verification activity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-3xl font-bold text-foreground mb-1">
                        {validatorStats.pending}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Pending
                      </div>
                    </div>
                    <div className="text-center p-4 bg-green-500/10 rounded-lg">
                      <div className="text-3xl font-bold text-green-600 mb-1">
                        {validatorStats.completed}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Completed
                      </div>
                    </div>
                    <div className="text-center p-4 bg-red-500/10 rounded-lg">
                      <div className="text-3xl font-bold text-red-600 mb-1">
                        {validatorStats.rejected}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Rejected
                      </div>
                    </div>
                    <div className="text-center p-4 bg-primary/10 rounded-lg">
                      <div className="text-3xl font-bold text-primary mb-1">
                        {validatorStats.successRate}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Success Rate
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Verification Status Card */}
          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <CardTitle>Identity Verification</CardTitle>
              <CardDescription>
                Complete your identity verification to unlock all YoTouch
                features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {verificationStatus === "unverified" && (
                <div className="text-center py-8">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <User className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Get Verified</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Start your verification journey to gain trust on the YoTouch
                    platform and access verification services.
                  </p>
                  <Button
                    size="lg"
                    variant="hero"
                    onClick={() => navigate("/facial-verification")}
                  >
                    Start Verification Process
                  </Button>
                </div>
              )}

              {verificationStatus === "pending" && (
                <div className="space-y-8">
                  <div className="text-center py-8">
                    <div className="w-20 h-20 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
                      <Clock className="w-10 h-10 text-yellow-500 animate-pulse" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">
                      Verification in Progress
                    </h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Your verification request was sent to validators and is
                      currently in the community review window. This usually
                      takes 24-48 hours.
                    </p>
                  </div>

                  {requestLoading && (
                    <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating progress...
                    </div>
                  )}

                  {!requestLoading && userRequest && (
                    <div className="space-y-4 text-left">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Current progress
                      </p>
                      <div className="space-y-3">
                        {progressSteps.map((step) => (
                          <div
                            key={step.title}
                            className="flex items-start gap-4 rounded-xl border border-border/60 bg-muted/40 p-4"
                          >
                            <div
                              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                step.complete
                                  ? "bg-green-500/10 text-green-600"
                                  : "bg-background text-muted-foreground"
                              }`}
                            >
                              {step.icon}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-foreground">
                                    {step.title}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {step.description}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    step.complete
                                      ? "border-green-500/40 text-green-600"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {step.statusText}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {verificationStatus === "verified" && (
                <div className="text-center py-8">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">
                    Verification Complete!
                  </h3>
                  <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                    Your identity has been verified and your proof is stored on
                    the Cardano blockchain.
                  </p>
                  {profile?.blockchain_proof_hash && (
                    <div className="bg-muted rounded-lg p-4 max-w-md mx-auto">
                      <p className="text-xs text-muted-foreground mb-1">
                        Blockchain Proof Hash
                      </p>
                      <code className="text-xs font-mono break-all">
                        {profile.blockchain_proof_hash}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {verificationStatus === "pending" && (
            <Card className="border-primary/40 bg-primary/5 shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <Shield className="w-4 h-4" />
                  <p className="text-sm font-semibold uppercase tracking-[0.3em]">
                    Community review window
                  </p>
                </div>
                <CardTitle className="text-xl">
                  Validators around{" "}
                  {profile?.residential_address || "your address"} are weighing
                  in
                </CardTitle>
                <CardDescription>
                  We send anonymized dossiers to trusted humans in your area and
                  secondary AI sentinels. Their reviews feed directly into your
                  scorecard below.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/40 bg-white/60 p-4 text-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Stage 1
                  </p>
                  <p className="mt-2 text-base font-semibold">
                    Local reputation pings
                  </p>
                  <p className="text-sm text-slate-600">
                    Primary validators confirm they know you physically and
                    validate your address claim.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/40 bg-white/60 p-4 text-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Stage 2
                  </p>
                  <p className="mt-2 text-base font-semibold">
                    Secondary vetting
                  </p>
                  <p className="text-sm text-slate-600">
                    Anonymous community reviewers test for consistency, fraud
                    signals, and social proof.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/40 bg-white/60 p-4 text-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Stage 3
                  </p>
                  <p className="mt-2 text-base font-semibold">Score updates</p>
                  <p className="text-sm text-slate-600">
                    As every review lands, your dashboard score refreshes and
                    the Cardano proof queue prepares the final hash.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardDescription>Verification Score</CardDescription>
                <CardTitle className="text-3xl">
                  {profile?.verification_score || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardDescription>Status</CardDescription>
                <CardTitle className="text-2xl capitalize">
                  {profile?.verification_status || "Unverified"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardDescription>Blockchain Proof</CardDescription>
                <CardTitle className="text-2xl">
                  {profile?.blockchain_proof_hash ? "Yes" : "No"}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
