import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CampaignDetail from "./pages/CampaignDetail";
import ContributionPage from "./pages/ContributionPage";
import ContributionWizardPage from "./pages/ContributionWizardPage";
import ContributionNeedsPage from "./pages/ContributionNeedsPage";
import ContributionConfirmationPage from "./pages/ContributionConfirmationPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminMobilePage from "./pages/AdminMobilePage";
import CheckoutPage from "./pages/CheckoutPage";
import AccountabilityPage from "./pages/AccountabilityPage";
import AmbassadorsPage from "./pages/AmbassadorsPage";
import AccountabilityDetailPage from "./pages/AccountabilityDetailPage";
import CampaignsPage from "./pages/CampaignsPage";
import AccountabilityIndexPage from "./pages/AccountabilityIndexPage";
import PaymentReturnPage from "./pages/PaymentReturnPage";
import DonorsPage from "./pages/DonorsPage";
import PartnerSpotlightPage from "./pages/PartnerSpotlightPage";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/campaigns"} component={CampaignsPage} />
      <Route path={"/campaign/:id"} component={CampaignDetail} />
      <Route path={"/partner/:id"} component={PartnerSpotlightPage} />
      <Route path={"/donors"} component={DonorsPage} />
      <Route path={"/contribute/wizard/:id"} component={ContributionWizardPage} />
      <Route path={"/contribute/items/:id"} component={ContributionNeedsPage} />
      <Route path={"/contribute/confirmation"} component={ContributionConfirmationPage} />
      <Route path={"/contribute/:id"} component={ContributionPage} />
      <Route path={"/checkout/:campaignId"} component={CheckoutPage} />
      <Route path={"/payment/success"}>{() => <PaymentReturnPage state="success" />}</Route>
      <Route path={"/payment/pending"}>{() => <PaymentReturnPage state="pending" />}</Route>
      <Route path={"/payment/failure"}>{() => <PaymentReturnPage state="failure" />}</Route>
      <Route path={"/accountability"} component={AccountabilityIndexPage} />
      <Route path={"/accountability/:id"} component={AccountabilityPage} />
      <Route path={"/ambassadors"} component={AmbassadorsPage} />
      <Route path={"/accountability-detail/:id"} component={AccountabilityDetailPage} />
      <Route path={"/admin"} component={AdminDashboard} />
      <Route path={"/admin-mobile"} component={AdminMobilePage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
