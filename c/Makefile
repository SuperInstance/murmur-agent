CC = gcc
CFLAGS = -Wall -Wextra -O2 -std=c11
LDFLAGS = -lm

.PHONY: all clean install

all: murmur

murmur: murmur-cli.c
	$(CC) $(CFLAGS) -o murmur murmur-cli.c $(LDFLAGS)

clean:
	rm -f murmur

install: murmur
	cp murmur /usr/local/bin/murmur
