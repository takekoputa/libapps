// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Network resolver logic.
// https://pubs.opengroup.org/onlinepubs/9699919799/functions/freeaddrinfo.html
// https://pubs.opengroup.org/onlinepubs/9699919799/functions/getnameinfo.html

#include <netdb.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/types.h>

#include "bh-syscalls.h"
#include "debug.h"

static const char *const gai_errors[] = {
  "Unknown error",
  "The name could not be resolved at this time",
  "The flags had an invalid value",
  "A non-recoverable error occurred",
  "The address family was not recognized",
  "Memory allocation failure",
  "The name does not resolve",
  "The service is not recognized",
  "The intended socket type was not recognized",
  "A system error occurred",
  "An argument buffer overflowed",
};

// Look up the network error code and convert it to a readable string.
const char* gai_strerror(int errcode) {
  const char* msg = gai_errors[0];
  _ENTER("errcode=%i", errcode);
  if (errcode <= EAI_AGAIN && errcode >= EAI_OVERFLOW)
    msg = gai_errors[-errcode];
  _EXIT("ret={%s}", msg);
  return msg;
}

// Determine whether the host is the "localhost".
static bool is_localhost(const char* node) {
  if (node == NULL)
    return true;

  if (!strcmp(node, "localhost"))
    return true;

  size_t len = strlen(node);
  static const char localdomain[] = ".localdomain";
  if (len >= sizeof(localdomain) &&
      !strcmp(node + len - sizeof(localdomain) + 1, localdomain))
    return true;

  static const char localhost[] = ".localhost";
  if (len >= sizeof(localhost) &&
      !strcmp(node + len - sizeof(localhost) + 1, localhost))
    return true;

  return false;
}

// Return addresses in the 0.0.0.0/8 "current network" pool.
static uint32_t next_fake_addr(const char* node) {
  static uint32_t fake_addr = 0;
  sock_register_fake_addr(fake_addr, node);
  return fake_addr++;
}

// Return addresses in the 100::/64 "discard" pool.
static struct in6_addr* next_fake_addr6(const char* node) {
  static struct in6_addr fake_addr = {1};
  // TODO(vapier): This only handles 256 IPv6 hosts.  Do we care?
  fake_addr.s6_addr[15] = next_fake_addr(node);
  return &fake_addr;
}

// Resolve a hostname into an IP address.
//
// We don't implement AI_ADDRCONFIG or AI_V4MAPPED as nothing uses them atm.
//
// TODO(vapier): Implement support for AI_PASSIVE.
int getaddrinfo(const char* node, const char* service,
                const struct addrinfo* hints, struct addrinfo** res) {
  _ENTER("node={%s} service={%s} hints=%p res=%p", node, service, hints, res);

  int ai_protocol = 0;

  // Unpack the hints if specified.
  int ai_family = AF_UNSPEC;
  int ai_flags = 0;
  int ai_socktype = 0;
  if (hints) {
    ai_family = hints->ai_family;
    ai_flags = hints->ai_flags;
    ai_socktype = hints->ai_socktype;
    if (ai_family != AF_UNSPEC && ai_family != AF_INET &&
        ai_family != AF_INET6) {
      _EXIT("EAI_FAMILY: bad hints->ai_family");
      return EAI_FAMILY;
    }
  }

  // We only support numeric ports currently.
  long sin_port = 0;
  if (service) {
    char* endptr;
    sin_port = strtol(service, &endptr, 10);
    if (*endptr != '\0' || sin_port < 1 || sin_port > 0xffff) {
      if (ai_flags & AI_NUMERICSERV) {
        _EXIT("EAI_NONAME: non-numeric service (port)");
        return EAI_NONAME;
      } else {
        // We'd resolve the service here, if we wanted.
        _EXIT("EAI_FAIL: bad service (port)");
        return EAI_FAIL;
      }
    }
  }

  // Resolve a few known knowns and IP addresses.  Fake (delay) the rest.
  // The -1 protocol value indicates delayed hostname resolution -- the caller
  // uses that when creating the socket, so the JS side will see it and can
  // clearly differentiate between the two modes.
  uint32_t s_addr;
  struct in6_addr sin6_addr;
  if (ai_family == AF_INET6) {
    if (is_localhost(node)) {
      memcpy(&sin6_addr, &in6addr_loopback, sizeof(in6addr_loopback));
    } else if (inet_pton(AF_INET6, node, &sin6_addr) != 1) {
      if (ai_flags & AI_NUMERICHOST) {
        _EXIT("EAI_NONAME: non-numeric IPv6 address");
        return EAI_NONAME;
      } else {
        ai_protocol = -1;
        memcpy(&sin6_addr, next_fake_addr6(node), sizeof(sin6_addr));
      }
    }
  } else {
    if (is_localhost(node)) {
      s_addr = htonl(0x7f000001);
    } else if (inet_pton(AF_INET, node, &s_addr) != 1) {
      if (ai_flags & AI_NUMERICHOST) {
        _EXIT("EAI_NONAME: non-numeric IPv4 address");
        return EAI_NONAME;
      } else {
        ai_protocol = -1;
        s_addr = next_fake_addr(node);
      }
    }
  }

  // Return the result.
  struct addrinfo* ret = malloc(sizeof(*ret));
  memset(ret, 0, sizeof(*ret));
  // POSIX says flags are unused.
  ret->ai_flags = 0;
  ret->ai_socktype = ai_socktype;
  ret->ai_protocol = ai_protocol;
  union {
    struct sockaddr_storage storage;
    struct sockaddr sa;
    struct sockaddr_in sin;
    struct sockaddr_in6 sin6;
  }* sa = malloc(sizeof(*sa));
  memset(sa, 0, sizeof(*sa));
  if (ai_family == AF_INET6) {
    struct sockaddr_in6* sin6 = &sa->sin6;
    sin6->sin6_family = AF_INET6;
    sin6->sin6_port = htons(sin_port);
    memcpy(&sin6->sin6_addr, &sin6_addr, sizeof(sin6_addr));
    ret->ai_family = AF_INET6;
  } else {
    struct sockaddr_in* sin = &sa->sin;
    sin->sin_family = AF_INET;
    sin->sin_port = htons(sin_port);
    sin->sin_addr.s_addr = s_addr;
    ret->ai_family = AF_INET;
  }
  ret->ai_addrlen = sizeof(*sa);
  ret->ai_addr = &sa->sa;
  ret->ai_canonname = NULL;
  ret->ai_next = NULL;
  *res = ret;
  _EXIT("return 0");
  return 0;
}

// Free all the address structures.
void freeaddrinfo(struct addrinfo* ai) {
  _ENTER("ai=%p", ai);
  while (ai != NULL) {
    struct addrinfo* next = ai->ai_next;
    free(ai->ai_addr);
    _MID("free=%p", ai);
    free(ai);
    ai = next;
  }
  _EXIT("done");
}

// Translate a socket address to a hostname (if resolvable) & port.
//
// This stub always returns IP addresses and doesn't attempt reverse lookups.
int getnameinfo(const struct sockaddr* sa, socklen_t salen,
                char* node, socklen_t nodelen,
                char* service, socklen_t servicelen,
                int flags) {
  _ENTER("sa=%p salen=%u node=%p nodelen=%u service=%p servicelen=%u flags=%x",
         sa, salen, node, nodelen, service, servicelen, flags);

  if (sa->sa_family != AF_INET && sa->sa_family != AF_INET6) {
    _EXIT("EAI_FAMILY");
    return EAI_FAMILY;
  }

  const struct sockaddr_in6* sin6 = (const struct sockaddr_in6*)sa;
  const struct sockaddr_in* sin = (const struct sockaddr_in*)sa;

  if (node) {
    if (sa->sa_family == AF_INET6)
      inet_ntop(AF_INET6, &sin6->sin6_addr, node, nodelen);
    else
      inet_ntop(AF_INET, &sin->sin_addr, node, nodelen);
  }

  if (service)
    snprintf(service, servicelen, "%d", ntohs(sin->sin_port));

  _EXIT("node={%s} service={%s}", node ? : "", service ? : "");
  return 0;
}
