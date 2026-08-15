FROM fedora:41
RUN dnf install -y curl unzip tar bash \
	&& dnf clean all
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.11"
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /src
