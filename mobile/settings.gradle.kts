// Top-level Gradle settings for the statcompy-attendance Android app
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

// Azure AI Vision Face SDK (on-device liveness) is split across two artifacts:
//   com.azure:azure-ai-vision-face-ui         -> PUBLIC on mavenCentral (1.5.1)
//   com.azure:azure-ai-vision-face-ui-assets  -> NOT public; private feed only
// The -assets artifact is a hard (compile-scope) dependency of the -ui POM, so
// resolution fails without the private Azure Artifacts feed below. That feed
// answers 401 with an Entra auth challenge and needs a Microsoft-issued access
// token — the same value referenced as `mavenPassword` in Microsoft's own sample
// (Azure-Samples/azure-ai-vision-sdk).
//
// The repository is therefore declared only when a token is actually supplied.
// Without one the build resolves exactly as it did before and the kiosk keeps
// using the ML Kit + TensorFlow Lite cosine path — adding this must not break
// the production APK for anyone who has no token.
//
// Supply it OUTSIDE the repo (never commit it) via either:
//   ~/.gradle/gradle.properties ->  azureFaceMavenToken=<token>
//   environment                 ->  AZURE_FACE_MAVEN_TOKEN=<token>
val azureFaceMavenUser: String =
    providers.gradleProperty("azureFaceMavenUser").orNull
        ?: System.getenv("AZURE_FACE_MAVEN_USER")
        ?: "any_user"
val azureFaceMavenToken: String? =
    providers.gradleProperty("azureFaceMavenToken").orNull
        ?: System.getenv("AZURE_FACE_MAVEN_TOKEN")

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        if (!azureFaceMavenToken.isNullOrBlank()) {
            maven {
                name = "AzureAIVision"
                url = uri("https://pkgs.dev.azure.com/msface/SDK/_packaging/AzureAIVision/maven/v1")
                credentials {
                    username = azureFaceMavenUser
                    password = azureFaceMavenToken
                }
            }
        }
    }
}

rootProject.name = "statcompy-attendance"
include(":app")
include(":essportal")
