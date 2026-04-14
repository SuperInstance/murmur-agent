**murmur-cli.c**
```c
/*
 * murmur-cli.c
 *
 * A tiny, self‑contained re‑implementation of the “murmur‑agent” described
 * in the original TypeScript project.  It provides a command line interface
 * with the following sub‑commands:
 *
 *   murmur think <topic> [--json]   – generate a thought using four simple strategies
 *   murmur scan  <directory>        – copy all regular files from <directory> into the knowledge store
 *   murmur budget                   – display remaining daily budget
 *   murmur export [--json]          – export all thoughts as markdown (or JSON with --json)
 *   murmur status                   – show a short status line
 *
 * All state is stored under $HOME/.murmur/ :
 *
 *   $HOME/.murmur/context/   – copied context files (knowledge tensor)
 *   $HOME/.murmur/thoughts/  – one file per thought (markdown + optional JSON)
 *   $HOME/.murmur/budget.txt  – simple text file tracking daily limits
 *
 * The program is deliberately simple: it uses only the C standard library
 * and POSIX calls, no external dependencies.  The “strategies” are very
 * lightweight heuristics that operate on the raw text of the stored context
 * files.
 *
 * Compile with:
 *
 *     gcc -o murmur murmur-cli.c -lm
 *
 * (the -lm flag is only needed for the `pow` used in token counting.)
 */

#define _POSIX_C_SOURCE 200809L   /* for strdup, getline, etc. */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <math.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
#include <ctype.h>

/* -------------------------------------------------------------------------- */
/* Configuration constants                                                    */
/* -------------------------------------------------------------------------- */

#define MAX_DAILY_CALLS   100      /* maximum number of think calls per day   */
#define MAX_DAILY_TOKENS  100000   /* maximum number of “tokens” per day      */
#define MAX_LINE_LEN      1024
#define MAX_THOUGHTS      10000    /* arbitrary upper bound for export        */

/* -------------------------------------------------------------------------- */
/* Helper structures                                                          */
/* -------------------------------------------------------------------------- */

typedef struct {
    char date[11];          /* YYYY-MM-DD */
    int calls_used;
    int tokens_used;
} Budget;

typedef struct {
    char *explore;
    char *connect;
    char *contradict;
    char *synthesize;
} StrategiesResult;

typedef struct {
    char timestamp[20];    /* ISO 8601 */
    char *topic;
    StrategiesResult strat;
} Thought;

/* -------------------------------------------------------------------------- */
/* Path handling (all paths are under $HOME/.murmur)                          */
/* -------------------------------------------------------------------------- */

static char *home_dir(void)
{
    const char *h = getenv("HOME");
    if (!h) {
        fprintf(stderr, "ERROR: $HOME not set.\n");
        exit(EXIT_FAILURE);
    }
    return strdup(h);
}

static void join_path(char *dest, size_t destsz, const char *base, const char *sub)
{
    snprintf(dest, destsz, "%s/%s", base, sub);
}

/* -------------------------------------------------------------------------- */
/* Directory utilities                                                        */
/* -------------------------------------------------------------------------- */

static void ensure_dir(const char *path)
{
    struct stat st;
    if (stat(path, &st) == -1) {
        if (mkdir(path, 0700) == -1) {
            perror("mkdir");
            exit(EXIT_FAILURE);
        }
    } else if (!S_ISDIR(st.st_mode)) {
        fprintf(stderr, "ERROR: %s exists but is not a directory.\n", path);
        exit(EXIT_FAILURE);
    }
}

/* -------------------------------------------------------------------------- */
/* Budget handling                                                            */
/* -------------------------------------------------------------------------- */

static void get_today(char *buf, size_t bufsz)
{
    time_t t = time(NULL);
    struct tm tm = *localtime(&t);
    strftime(buf, bufsz, "%Y-%m-%d", &tm);
}

/* Load budget from $HOME/.murmur/budget.txt.
 * File format (plain text):
 *   YYYY-MM-DD CALLS_USED TOKENS_USED
 * If the file does not exist or the date is older than today, a fresh budget
 * is returned.
 */
static Budget load_budget(const char *base_dir)
{
    char path[PATH_MAX];
    join_path(path, sizeof(path), base_dir, "budget.txt");

    Budget b = {0};
    get_today(b.date, sizeof(b.date));
    b.calls_used = 0;
    b.tokens_used = 0;

    FILE *f = fopen(path, "r");
    if (!f) return b;               /* no file → fresh budget */

    char file_date[11];
    if (fscanf(f, "%10s %d %d", file_date, &b.calls_used, &b.tokens_used) == 3) {
        if (strcmp(file_date, b.date) == 0) {
            /* same day – keep the values */
        } else {
            b.calls_used = 0;
            b.tokens_used = 0;
        }
    }
    fclose(f);
    return b;
}

/* Persist budget back to disk */
static void save_budget(const char *base_dir, const Budget *b)
{
    char path[PATH_MAX];
    join_path(path, sizeof(path), base_dir, "budget.txt");

    FILE *f = fopen(path, "w");
    if (!f) {
        perror("fopen budget.txt");
        exit(EXIT_FAILURE);
    }
    fprintf(f, "%s %d %d\n", b->date, b->calls_used, b->tokens_used);
    fclose(f);
}

/* -------------------------------------------------------------------------- */
/* Token counting (very rough: each word = 1 token)                           */
/* -------------------------------------------------------------------------- */

static int count_tokens(const char *text)
{
    int tokens = 0;
    int in_word = 0;
    for (const char *p = text; *p; ++p) {
        if (isalnum((unsigned char)*p) || *p == '_' || *p == '-') {
            if (!in_word) {
                ++tokens;
                in_word = 1;
            }
        } else {
            in_word = 0;
        }
    }
    return tokens;
}

/* -------------------------------------------------------------------------- */
/* Knowledge tensor – simple file‑based storage                               */
/* -------------------------------------------------------------------------- */

/* Copy all regular files from src_dir into $HOME/.murmur/context/. */
static void scan_directory(const char *src_dir, const char *ctx_dir)
{
    DIR *d = opendir(src_dir);
    if (!d) {
        perror("opendir (scan)");
        exit(EXIT_FAILURE);
    }

    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        if (ent->d_type != DT_REG) continue;   /* only regular files */

        char src_path[PATH_MAX];
        char dst_path[PATH_MAX];
        join_path(src_path, sizeof(src_path), src_dir, ent->d_name);
        join_path(dst_path, sizeof(dst_path), ctx_dir, ent->d_name);

        FILE *src = fopen(src_path, "r");
        if (!src) {
            perror("fopen src file");
            continue;
        }
        FILE *dst = fopen(dst_path, "w");
        if (!dst) {
            perror("fopen dst file");
            fclose(src);
            continue;
        }

        char buf[MAX_LINE_LEN];
        while (fgets(buf, sizeof(buf), src))
            fputs(buf, dst);

        fclose(src);
        fclose(dst);
    }
    closedir(d);
}

/* Load all context files into a single large string (concatenated). */
static char *load_all_context(const char *ctx_dir)
{
    size_t total = 0;
    size_t capacity = 8192;
    char *buffer = malloc(capacity);
    if (!buffer) {
        perror("malloc");
        exit(EXIT_FAILURE);
    }
    buffer[0] = '\0';

    DIR *d = opendir(ctx_dir);
    if (!d) {
        perror("opendir (context)");
        free(buffer);
        exit(EXIT_FAILURE);
    }

    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        if (ent->d_type != DT_REG) continue;

        char path[PATH_MAX];
        join_path(path, sizeof(path), ctx_dir, ent->d_name);
        FILE *f = fopen(path, "r");
        if (!f) {
            perror("fopen context file");
            continue;
        }

        char line[MAX_LINE_LEN];
        while (fgets(line, sizeof(line), f)) {
            size_t len = strlen(line);
            if (total + len + 1 > capacity) {
                capacity *= 2;
                buffer = realloc(buffer, capacity);
                if (!buffer) {
                    perror("realloc");
                    fclose(f);
                    closedir(d);
                    exit(EXIT_FAILURE);
                }
            }
            memcpy(buffer + total, line, len);
            total += len;
            buffer[total] = '\0';
        }
        fclose(f);
    }
    closedir(d);
    return buffer;   /* caller must free() */
}

/* -------------------------------------------------------------------------- */
/* Strategy implementations                                                   */
/* -------------------------------------------------------------------------- */

/* Very naive “explore” – find sentences that contain the topic word but
 * do not contain any of the words “is”, “are”, “was”, “were”.
 */
static char *strategy_explore(const char *topic, const char *context)
{
    const char *p = context;
    char *result = NULL;
    size_t res_cap = 0, res_len = 0;

    while (*p) {
        const char *sent_start = p;
        const char *sent_end = strchr(p, '.');
        if (!sent_end) sent_end = p + strlen(p);
        size_t sent_len = sent_end - sent_start + 1;   /* include '.' */

        char *sentence = strndup(sent_start, sent_len);
        if (!sentence) {
            perror("strndup");
            exit(EXIT_FAILURE);
        }

        if (strcasestr(sentence, topic) &&
            !strcasestr(sentence, " is ") &&
            !strcasestr(sentence, " are ") &&
            !strcasestr(sentence, " was ") &&
            !strcasestr(sentence, " were ")) {
            /* keep this sentence */
            if (res_len + sent_len + 2 > res_cap) {
                res_cap = (res_cap ? res_cap * 2 : 1024);
                result = realloc(result, res_cap);
                if (!result) {
                    perror("realloc");
                    free(sentence);
                    exit(EXIT_FAILURE);
                }
            }
            memcpy(result + res_len, sentence, sent_len);
            res_len += sent_len;
            result[res_len++] = '\n';
            result[res_len] = '\0';
        }
        free(sentence);
        p = (*sent_end) ? sent_end + 1 : sent_end;
    }

    if (!result) {
        result = strdup("No exploratory material found.");
    }
    return result;
}

/* “connect” – find lines that contain the topic and at least one other
 * distinct word (simple heuristic).
 */
static char *strategy_connect(const char *topic, const char *context)
{
    char *result = NULL;
    size_t cap = 0, len = 0;
    char *ctx_copy = strdup(context);
    if (!ctx_copy) { perror("strdup"); exit(EXIT_FAILURE); }

    char *line = NULL;
    char *saveptr = NULL;
    line = strtok_r(ctx_copy, "\n", &saveptr);
    while (line) {
        if (strcasestr(line, topic)) {
            /* count distinct words besides the topic */
            int other = 0;
            char *tok_save = NULL;
            char *word = strtok_r(line, " \t\r", &tok_save);
            while (word) {
                if (!strcasestr(word, topic) && isalpha((unsigned char)word[0]))
                    ++other;
                word = strtok_r(NULL, " \t\r", &tok_save);
            }
            if (other >= 1) {
                size_t l = strlen(line);
                if (len + l + 2 > cap) {
                    cap = (cap ? cap * 2 : 1024);
                    result = realloc(result, cap);
                    if (!result) { perror("realloc"); exit(EXIT_FAILURE); }
                }
                memcpy(result + len, line, l);
                len += l;
                result[len++] = '\n';
                result[len] = '\0';
            }
        }
        line = strtok_r(NULL, "\n", &saveptr);
    }
    free(ctx_copy);
    if (!result) result = strdup("No connections found.");
    return result;
}

/* “contradict” – look for sentences that contain the topic together with
 * a negation word (not, never, no).
 */
static char *strategy_contradict(const char *topic, const char *context)
{
    const char *neg_words[] = {" not ", " never ", " no "};
    const char *p = context;
    char *result = NULL;
    size_t cap = 0, len = 0;

    while (*p) {
        const char *sent_start = p;
        const char *sent_end = strchr(p, '.');
        if (!sent_end) sent_end = p + strlen(p);
        size_t sent_len = sent_end - sent_start + 1;
        char *sentence = strndup(sent_start, sent_len);
        if (!sentence) { perror("strndup"); exit(EXIT_FAILURE); }

        if (strcasestr(sentence, topic)) {
            for (size_t i = 0; i < sizeof(neg_words)/sizeof(neg_words[0]); ++i) {
                if (strcasestr(sentence, neg_words[i])) {
                    if (len + sent_len + 2 > cap) {
                        cap = (cap ? cap * 2 : 1024);
                        result = realloc(result, cap);
                        if (!result) { perror("realloc"); exit(EXIT_FAILURE); }
                    }
                    memcpy(result + len, sentence, sent_len);
                    len += sent_len;
                    result[len++] = '\n';
                    result[len] = '\0';
                    break;
                }
            }
        }
        free(sentence);
        p = (*sent_end) ? sent_end + 1 : sent_end;
    }

    if (!result) result = strdup("No contradictions found.");
    return result;
}

/* “synthesize” – concatenate the three previous results, removing duplicates. */
static char *strategy_synthesize(const StrategiesResult *sr)
{
    /* Very simple: just join the four strings with headings. */
    const char *fmt =
        "## Explore\n%s\n"
        "## Connect\n%s\n"
        "## Contradict\n%s\n"
        "## Synthesize\n%s\n";

    size_t needed = snprintf(NULL, 0, fmt,
                             sr->explore, sr->connect,
                             sr->contradict, sr->synthesize) + 1;
    char *out = malloc(needed);
    if (!out) { perror("malloc"); exit(EXIT_FAILURE); }
    snprintf(out, needed, fmt,
             sr->explore, sr->connect,
             sr->contradict, sr->synthesize);
    return out;
}

/* -------------------------------------------------------------------------- */
/* Thought handling (creation, persistence, export)                           */
/* -------------------------------------------------------------------------- */

static char *iso_timestamp(void)
{
    time_t t = time(NULL);
    struct tm tm = *gmtime(&t);
    char *buf = malloc(21);
    if (!buf) { perror("malloc"); exit(EXIT_FAILURE); }
    snprintf(buf, 21, "%04d-%02d-%02dT%02d:%02d:%02dZ",
             tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
             tm.tm_hour, tm.tm_min, tm.tm_sec);
    return buf;
}

/* Write a single thought to $HOME/.murmur/thoughts/<timestamp>.md
 * If json_flag is true, also write a <timestamp>.json file.
 */
static void persist_thought(const char *thoughts_dir,
                            const Thought *th,
                            int json_flag)
{
    char md_path[PATH_MAX];
    char json_path[PATH_MAX];
    join_path(md_path, sizeof(md_path), thoughts_dir, th->timestamp);
    strcat(md_path, ".md");

    FILE *md = fopen(md_path, "w");
    if (!md) { perror("fopen thought md"); exit(EXIT_FAILURE); }

    fprintf(md, "# Thought on \"%s\"\n", th->topic);
    fprintf(md, "Generated at %s UTC\n\n", th->timestamp);
    fprintf(md, "## Explore\n%s\n\n", th->strat.explore);
    fprintf(md, "## Connect\n%s\n\n", th->strat.connect);
    fprintf(md, "## Contradict\n%s\n\n", th->strat.contradict);
    fprintf(md, "## Synthesize\n%s\n", th->strat.synthesize);
    fclose(md);

    if (json_flag) {
        join_path(json_path, sizeof(json_path), thoughts_dir, th->timestamp);
        strcat(json_path, ".json");
        FILE *js = fopen(json_path, "w");
        if (!js) { perror("fopen thought json"); exit(EXIT_FAILURE); }

        fprintf(js,
                "{\n"
                "  \"timestamp\": \"%s\",\n"
                "  \"topic\": \"%s\",\n"
                "  \"explore\": \"%s\",\n"
                "  \"connect\": \"%s\",\n"
                "  \"contradict\": \"%s\",\n"
                "  \"synthesize\": \"%s\"\n"
                "}\n",
                th->timestamp,
                th->topic,
                th->strat.explore,
                th->strat.connect,
                th->strat.contradict,
                th->strat.synthesize);
        fclose(js);
    }
}

/* Export all thoughts as a single markdown file (or JSON array). */
static void export_all(const char *thoughts_dir, int json_flag)
{
    DIR *d = opendir(thoughts_dir);
    if (!d) {
        perror("opendir thoughts");
        exit(EXIT_FAILURE);
    }

    if (json_flag) {
        printf("[\n");
    }

    struct dirent *ent;
    int first = 1;
    while ((ent = readdir(d)) != NULL) {
        size_t len = strlen(ent->d_name);
        if (len < 5) continue;               /* need at least ".md" */
        if (strcmp(ent->d_name + len - 3, ".md") != 0) continue;

        char path[PATH_MAX];
        join_path(path, sizeof(path), thoughts_dir, ent->d_name);
        FILE *f = fopen(path, "r");
        if (!f) { perror("fopen thought file"); continue; }

        /* Load whole file */
        fseek(f, 0, SEEK_END);
        long fsize = ftell(f);
        fseek(f, 0, SEEK_SET);
        char *content = malloc(fsize + 1);
        if (!content) { perror("malloc"); fclose(f); continue; }
        fread(content, 1, fsize, f);
        content[fsize] = '\0';
        fclose(f);

        if (json_flag) {
            /* Convert markdown to a simple JSON object (very naive). */
            if (!first) printf(",\n");
            printf("  {\n    \"file\": \"%s\",\n    \"content\": \"", ent->d_name);
            for (char *p = content; *p; ++p) {
                if (*p == '\"' || *p == '\\')
                    printf("\\%c", *p);
                else if (*p == '\n')
                    printf("\\n");
                else
                    putchar(*p);
            }
            printf("\"\n  }");
            first = 0;
        } else {
            printf("%s\n", content);
        }
        free(content);
    }
    closedir(d);
    if (json_flag) {
        printf("\n]\n");
    }
}

/* -------------------------------------------------------------------------- */
/* Status display                                                             */
/* -------------------------------------------------------------------------- */

static void show_status(const char *base_dir)
{
    char ctx_path[PATH_MAX];
    join_path(ctx_path, sizeof(ctx_path), base_dir, "context");
    size_t file_cnt = 0, total_bytes = 0;

    DIR *d = opendir(ctx_path);
    if (d) {
        struct dirent *ent;
        while ((ent = readdir(d)) != NULL) {
            if (ent->d_type != DT_REG) continue;
            ++file_cnt;
            char fpath[PATH_MAX];
            join_path(fpath, sizeof(fpath), ctx_path, ent->d_name);
            struct stat st;
            if (stat(fpath, &st) == 0) total_bytes += st.st_size;
        }
        closedir(d);
    }

    printf("Knowledge tensor: %zu files, %zu bytes\n", file_cnt, total_bytes);
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

int main(int argc, char *argv[])
{
    /* Resolve base directory */
    char *home = home_dir();
    char base_dir[PATH_MAX];
    join_path(base_dir, sizeof(base_dir), home, ".murmur");
    free(home);

    /* Ensure required sub‑directories exist */
    char ctx_dir[PATH_MAX], th_dir[PATH_MAX];
    join_path(ctx_dir, sizeof(ctx_dir), base_dir, "context");
    join_path(th_dir,  sizeof(th_dir),  base_dir, "thoughts");
    ensure_dir(base_dir);
    ensure_dir(ctx_dir);
    ensure_dir(th_dir);

    if (argc < 2) {
        fprintf(stderr,
                "Usage: murmur <command> [args] [--json]\n"
                "Commands:\n"
                "  think <topic>        Generate a thought\n"
                "  scan  <directory>    Scan files into the knowledge store\n"
                "  budget               Show remaining daily budget\n"
                "  export [--json]      Export all thoughts\n"
                "  status               Show simple status\n");
        return EXIT_FAILURE;
    }

    /* Detect optional --json flag (must be last argument) */
    int json_flag = 0;
    if (argc > 2 && strcmp(argv[argc - 1], "--json") == 0) {
        json_flag = 1;
        argv[argc - 1] = NULL;   /* hide from command parsing */
        --argc;
    }

    const char *cmd = argv[1];

    if (strcmp(cmd, "scan") == 0) {
        if (argc != 3) {
            fprintf(stderr, "Usage: murmur scan <directory>\n");
            return EXIT_FAILURE;
        }
        scan_directory(argv[2], ctx_dir);
        printf("Scanning completed.\n");
    } else if (strcmp(cmd, "budget") == 0) {
        Budget b = load_budget(base_dir);
        printf("Date: %s\nCalls used: %d / %d\nTokens used: %d / %d\n",
               b.date, b.calls_used, MAX_DAILY_CALLS,
               b.tokens_used, MAX_DAILY_TOKENS);
    } else if (strcmp(cmd, "status") == 0) {
        show_status(base_dir);
    } else if (strcmp(cmd, "export") == 0) {
        export_all(th_dir, json_flag);
    } else if (strcmp(cmd, "think") == 0) {
        if (argc != 3) {
            fprintf(stderr, "Usage: murmur think <topic> [--json]\n");
            return EXIT_FAILURE;
        }
        const char *topic = argv[2];

        /* Load budget and enforce limits */
        Budget b = load_budget(base_dir);
        if (b.calls_used >= MAX_DAILY_CALLS) {
            fprintf(stderr, "ERROR: Daily call limit reached (%d).\n", MAX_DAILY_CALLS);
            return EXIT_FAILURE;
        }

        /* Load context */
        char *context = load_all_context(ctx_dir);
        if (!context) context = strdup("");

        /* Apply strategies */
        StrategiesResult sr = {0};
        sr.explore    = strategy_explore(topic, context);
        sr.connect    = strategy_connect(topic, context);
        sr.contradict = strategy_contradict(topic, context);
        sr.synthesize = strategy_synthesize(&sr);

        /* Count tokens for budgeting */
        int tokens = count_tokens(sr.explore) +
                     count_tokens(sr.connect) +
                     count_tokens(sr.contradict) +
                     count_tokens(sr.synthesize);
        if (b.tokens_used + tokens > MAX_DAILY_TOKENS) {
            fprintf(stderr, "ERROR: Daily token limit would be exceeded (%d).\n",
                    MAX_DAILY_TOKENS);
            free(context);
            free(sr.explore); free(sr.connect); free(sr.contradict); free(sr.synthesize);
            return EXIT_FAILURE;
        }

        /* Build thought record */
        Thought th = {0};
        th.timestamp = iso_timestamp();
        th.topic = strdup(topic);
        th.strat = sr;

        /* Persist */
        persist_thought(th_dir, &th, json_flag);

        /* Update budget */
        b.calls_used += 1;
        b.tokens_used += tokens;
        save_budget(base_dir, &b);

        /* Output to stdout (human readable) */
        if (json_flag) {
            /* JSON already written to file – just inform the user */
            printf("Thought saved as %s.json (and markdown).\n", th.timestamp);
        } else {
            printf("# Thought on \"%s\"\n", th.topic);
            printf("Generated at %s UTC\n\n", th.timestamp);
            printf("## Explore\n%s\n\n", sr.explore);
            printf("## Connect\n%s\n\n", sr.connect);
            printf("## Contradict\n%s\n\n", sr.contradict);
            printf("## Synthesize\n%s\n", sr.synthesize);
        }

        /* Clean up */
        free(context);
        free